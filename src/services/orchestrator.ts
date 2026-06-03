import { getClientForRole, getSystemPrompt } from "../agents/router.js";
import { runWorkerAgent } from "../agents/worker.js";
import { runReviewerAgent } from "../agents/reviewer.js";
import { Conversation } from "./conversation.js";
import { getDb } from "../storage/db.js";
import { loadConfig } from "../config/loader.js";
import * as tasksRepo from "../storage/repos/tasks.js";
import type { TaskRow } from "../storage/repos/tasks.js";
import * as reviewsRepo from "../storage/repos/reviews.js";
import * as eventsRepo from "../storage/repos/events.js";
import { renderTaskBanner, renderTaskComplete, renderSummary } from "../ui/chat-renderer.js";
import type { Message } from "../schemas/message.js";
import type { Task, Review } from "../schemas/backlog.js";
import chalk from "chalk";

export interface OrchestratorOptions {
  cwd: string;
  taskId?: string;
  all?: boolean;
  maxTurnsPerTask?: number;
  onMessage: (msg: Message) => void;
  onBanner: (text: string) => void;
  onComplete: (text: string) => void;
  onSeparator: () => void;
  pollUserInput: () => string | null;
}

export interface OrchestratorResult {
  completed: number;
  blocked: number;
}

export class Orchestrator {
  private cwd: string;
  private taskId?: string;
  private all: boolean;
  private maxTurnsPerTask: number;
  private onMessage: (msg: Message) => void;
  private onBanner: (text: string) => void;
  private onComplete: (text: string) => void;
  private onSeparator: () => void;
  private pollUserInput: () => string | null;
  private aborted = false;

  constructor(opts: OrchestratorOptions) {
    this.cwd = opts.cwd;
    this.taskId = opts.taskId;
    this.all = !!opts.all;
    this.maxTurnsPerTask = opts.maxTurnsPerTask || 20;
    this.onMessage = opts.onMessage;
    this.onBanner = opts.onBanner;
    this.onComplete = opts.onComplete;
    this.onSeparator = opts.onSeparator;
    this.pollUserInput = opts.pollUserInput;
  }

  abort(): void {
    this.aborted = true;
  }

  async run(): Promise<OrchestratorResult> {
    const db = getDb(this.cwd);
    const config = loadConfig(this.cwd);
    const tasks = this.getEligibleTasks(db);

    if (tasks.length === 0) {
      console.log(chalk.yellow("No eligible tasks (ASSIGNED status, within retry limit, dependencies done)."));
      console.log(chalk.gray("Run /start to generate tasks, then /plan to assign them."));
      return { completed: 0, blocked: 0 };
    }

    console.log(chalk.bold.gray("========================================"));
    console.log(chalk.bold.gray("  dteam run — Autonomous Orchestration"));
    console.log(chalk.bold.gray("========================================"));
    console.log(chalk.gray(`\nProcessing ${tasks.length} eligible task(s). Type to chat, Ctrl+C to stop.\n`));

    let completed = 0;
    let blocked = 0;

    for (const taskRow of tasks) {
      if (this.aborted) break;

      const task = tasksRepo.rowToTask(taskRow);

      try {
        const result = await this.processTask(db, config, task);
        if (result === "done") {
          completed++;
        } else {
          blocked++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error processing ${task.id}: ${msg}`));
        tasksRepo.updateStatus(db, task.id, "BLOCKED");
        blocked++;
      }
    }

    const summary = renderSummary(completed, blocked);
    console.log(summary);

    return { completed, blocked };
  }

  private async processTask(
    db: ReturnType<typeof getDb>,
    config: ReturnType<typeof loadConfig>,
    task: Task,
  ): Promise<"done" | "blocked"> {
    const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const branch = `task/${task.id}-${task.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    const worktree = `worktrees/${task.id}`;

    // Update status
    tasksRepo.updateExecution(db, task.id, branch, worktree);

    // Log event
    eventsRepo.append(db, {
      timestamp: new Date().toISOString(),
      run_id: runId,
      task_id: task.id,
      agent: task.assigned_agent,
      event: "execution_started",
      model: task.assigned_agent,
      input_refs: task.source_docs,
      worktree,
      summary: `Orchestrator started ${task.title}`,
    });

    // Banner
    this.onBanner(renderTaskBanner(task.id, task.title));

    // Init conversation
    const conv = new Conversation(task.id);
    const systemPrompt = getSystemPrompt("team_lead");
    conv.addSystem(systemPrompt);
    conv.addTeamLead(`Let me start working on ${task.id}: ${task.title}`);

    let msg = conv.lastMessage();
    if (msg) this.onMessage(msg);

    let turns = 0;
    let workerOutput: string | null = null;

    while (turns < this.maxTurnsPerTask) {
      // Check for user input
      const userMsg = this.pollUserInput();
      if (userMsg) {
        conv.addUser(userMsg);
        msg = conv.lastMessage();
        if (msg) this.onMessage(msg);

        if (userMsg === "/stop") {
          tasksRepo.updateStatus(db, task.id, "BLOCKED");
          eventsRepo.append(db, {
            timestamp: new Date().toISOString(),
            run_id: runId,
            task_id: task.id,
            agent: "user",
            event: "user_interrupt",
            summary: "Task blocked by user interrupt",
          });
          return "blocked";
        }
      }

      if (this.aborted) {
        tasksRepo.updateStatus(db, task.id, "BLOCKED");
        eventsRepo.append(db, {
          timestamp: new Date().toISOString(),
          run_id: runId,
          task_id: task.id,
          agent: "orchestrator",
          event: "aborted",
          summary: "Orchestration aborted",
        });
        return "blocked";
      }

      // Team Lead turn
      const tlResponse = await this.callTeamLead(db, task, conv, runId);
      conv.addTeamLead(tlResponse);
      msg = conv.lastMessage();
      if (msg) this.onMessage(msg);

      // Check completion
      if (Conversation.hasCompletionSignal(tlResponse)) {
        tasksRepo.updateStatus(db, task.id, "DONE");
        eventsRepo.append(db, {
          timestamp: new Date().toISOString(),
          run_id: runId,
          task_id: task.id,
          agent: "team_lead",
          event: "task_complete",
          summary: `Task ${task.id} completed by Team Lead signal`,
        });
        this.onComplete(renderTaskComplete(task.id));
        this.onSeparator();
        return "done";
      }

      // Process @mentions
      const mentions = Conversation.parseMentions(tlResponse);

      for (const target of mentions) {
        if (this.aborted) break;

        if (target === "reviewer") {
          if (!workerOutput) continue;

          try {
            const review = await runReviewerAgent(this.cwd, task, workerOutput, conv.messages);
            reviewsRepo.create(db, review);

            const reviewMsg = this.formatReview(review);
            conv.addReviewer(reviewMsg);
            msg = conv.lastMessage();
            if (msg) this.onMessage(msg);

            if (review.verdict === "approved") {
              tasksRepo.updateStatus(db, task.id, "DONE");
              eventsRepo.append(db, {
                timestamp: new Date().toISOString(),
                run_id: runId,
                task_id: task.id,
                agent: "reviewer",
                event: "review_approved",
                summary: `Review approved with score ${review.score}`,
              });
              this.onComplete(renderTaskComplete(task.id));
              this.onSeparator();
              return "done";
            } else {
              tasksRepo.updateStatus(db, task.id, "CHANGES_REQUESTED");
              tasksRepo.incrementRetry(db, task.id);

              const currentRow = tasksRepo.getById(db, task.id);
              const retryCount = currentRow?.execution_retry_count || 0;

              eventsRepo.append(db, {
                timestamp: new Date().toISOString(),
                run_id: runId,
                task_id: task.id,
                agent: "reviewer",
                event: "review_changes_requested",
                summary: `Changes requested (attempt ${retryCount}/${config.default_retry_limit})`,
              });

              if (retryCount >= config.default_retry_limit) {
                tasksRepo.updateStatus(db, task.id, "BLOCKED");
                eventsRepo.append(db, {
                  timestamp: new Date().toISOString(),
                  run_id: runId,
                  task_id: task.id,
                  agent: "orchestrator",
                  event: "retry_limit_exceeded",
                  summary: `Task blocked after ${retryCount} retries`,
                });
                return "blocked";
              }

              workerOutput = null;
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            conv.addReviewer(`Review failed: ${errMsg}`);
            msg = conv.lastMessage();
            if (msg) this.onMessage(msg);
          }
        }

        if (target === "backend-worker" || target === "frontend-worker" || target === "docs-test-worker") {
          try {
            const result = await runWorkerAgent(
              this.cwd,
              target,
              task,
              tlResponse,
              conv.messages,
            );
            workerOutput = result.output;
            conv.addWorker(target, result.output);
            msg = conv.lastMessage();
            if (msg) this.onMessage(msg);

            eventsRepo.append(db, {
              timestamp: new Date().toISOString(),
              run_id: runId,
              task_id: task.id,
              agent: target,
              event: "worker_responded",
              model: target,
              worktree,
              summary: `Worker ${target} produced output (${result.output.length} chars)`,
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            conv.addWorker(target, `Error: ${errMsg}`);
            msg = conv.lastMessage();
            if (msg) this.onMessage(msg);
          }
        }
      }

      turns++;
    }

    // Max turns exceeded
    tasksRepo.updateStatus(db, task.id, "BLOCKED");
    eventsRepo.append(db, {
      timestamp: new Date().toISOString(),
      run_id: runId,
      task_id: task.id,
      agent: "orchestrator",
      event: "max_turns_exceeded",
      summary: `Task blocked after ${this.maxTurnsPerTask} turns`,
    });
    console.log(chalk.red(`\n${task.id}: Exceeded max turns (${this.maxTurnsPerTask}). Blocking.`));
    return "blocked";
  }

  private async callTeamLead(
    db: ReturnType<typeof getDb>,
    task: Task,
    conv: Conversation,
    runId: string,
  ): Promise<string> {
    const { client, model } = getClientForRole(this.cwd, "team_lead");
    const systemPrompt = getSystemPrompt("team_lead");

    const messages = conv.toOpenAIWithSystem(systemPrompt);

    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || "";

    eventsRepo.append(db, {
      timestamp: new Date().toISOString(),
      run_id: runId,
      task_id: task.id,
      agent: "team_lead",
      event: "team_lead_response",
      model,
      summary: `Team Lead response (${content.length} chars)`,
    });

    return content;
  }

  private formatReview(review: Review): string {
    const verdictColor = review.verdict === "approved"
      ? chalk.green
      : review.verdict === "changes_requested"
        ? chalk.yellow
        : chalk.red;

    let msg = `Verdict: ${verdictColor(review.verdict)} | Score: ${review.score}`;
    if (review.comments.length > 0) {
      msg += "\n" + review.comments.map((c) => `  - ${c}`).join("\n");
    }
    return msg;
  }

  private getEligibleTasks(db: ReturnType<typeof getDb>): TaskRow[] {
    const rows = tasksRepo.listEligible(db, "DONE");

    // Filter by dependency satisfaction
    const withSatisfiedDeps = rows.filter((row) => {
      const task = tasksRepo.rowToTask(row);
      if (task.depends_on.length === 0) return true;
      return task.depends_on.every((depId) => {
        const depRow = tasksRepo.getById(db, depId);
        return depRow && depRow.status === "DONE";
      });
    });

    // Filter by retry limit from config
    const config = loadConfig(this.cwd);
    const withinRetry = withSatisfiedDeps.filter((row) => {
      return (row.execution_retry_count || 0) < config.default_retry_limit;
    });

    // If specific task requested
    if (this.taskId) {
      const found = withinRetry.find((r) => r.id === this.taskId);
      return found ? [found] : [];
    }

    // If --all, return all
    if (this.all) {
      return withinRetry;
    }

    // Default: first one
    return withinRetry.length > 0 ? [withinRetry[0]] : [];
  }
}
