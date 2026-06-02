import chalk from "chalk";
import * as path from "node:path";
import { getDb } from "../storage/db.js";
import * as tasksRepo from "../storage/repos/tasks.js";
import * as eventsRepo from "../storage/repos/events.js";
import { configExists } from "../config/loader.js";

export interface RunOptions {
  next?: boolean;
  epic?: string;
}

export async function runTask(cwd: string, taskId: string | undefined, opts: RunOptions): Promise<void> {
  if (!configExists(cwd)) {
    console.log(chalk.red("No .digital-team/config.yaml found. Run /init first."));
    return;
  }

  const db = getDb(cwd);

  if (opts.epic) {
    const tasks = tasksRepo.listByEpic(db, opts.epic);
    const eligible = tasks.filter((t) => t.status === "ASSIGNED");
    if (eligible.length === 0) {
      console.log(chalk.yellow(`No ASSIGNED tasks in epic ${opts.epic}.`));
      return;
    }
    console.log(chalk.bold(`\nEpic ${opts.epic}: ${eligible.length} ready task(s)\n`));
    for (const t of eligible) {
      console.log(`  ${chalk.cyan(t.id)}  ${t.title}`);
    }
    console.log(chalk.gray("\nRun individual tasks with: /run TASK-XXX"));
    return;
  }

  if (opts.next || !taskId) {
    const eligible = tasksRepo.listEligible(db, "DONE");
    if (eligible.length === 0) {
      console.log(chalk.yellow("No eligible tasks (ASSIGNED status, dependencies done)."));
      console.log(chalk.gray("Run /start to generate tasks, then /plan to assign them."));
      return;
    }
    taskId = eligible[0].id;
  }

  const row = tasksRepo.getById(db, taskId);
  if (!row) {
    console.log(chalk.red(`Task ${taskId} not found.`));
    return;
  }

  const task = tasksRepo.rowToTask(row);

  if (task.status !== "ASSIGNED") {
    console.log(chalk.yellow(`Task ${taskId} is ${task.status}, not ASSIGNED.`));
    return;
  }

  // Check dependencies
  if (task.depends_on.length > 0) {
    for (const depId of task.depends_on) {
      const dep = tasksRepo.getById(db, depId);
      if (!dep || dep.status !== "DONE") {
        console.log(chalk.red(`Cannot run ${taskId}: dependency ${depId} is not DONE (${dep?.status || "not found"}).`));
        return;
      }
    }
  }

  const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const branch = `task/${taskId}-${task.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
  const worktree = `worktrees/${taskId}`;

  console.log(chalk.bold(`\nExecuting ${chalk.cyan(taskId)}: ${task.title}\n`));
  console.log(`  Agent:    ${task.assigned_agent}`);
  console.log(`  Branch:   ${branch}`);
  console.log(`  Worktree: ${worktree}`);
  console.log(`  Run:      ${runId}`);

  // Update task to IN_PROGRESS
  tasksRepo.updateExecution(db, taskId, branch, worktree);

  // Log event
  eventsRepo.append(db, {
    timestamp: new Date().toISOString(),
    run_id: runId,
    task_id: taskId,
    agent: task.assigned_agent,
    event: "execution_started",
    model: task.assigned_agent,
    input_refs: task.source_docs,
    worktree,
    summary: `Started executing ${task.title}`,
  });

  // Create worktree directory placeholder
  const worktreePath = path.join(cwd, worktree);
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(worktreePath)) {
      fs.mkdirSync(worktreePath, { recursive: true });
    }
  } catch {
    // worktree creation through git isn't always available in test env
  }

  // Create runs directory entry
  const runsDir = path.join(cwd, "runs", runId);
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(runsDir)) {
      fs.mkdirSync(runsDir, { recursive: true });
    }
    // Create symlink to latest
    const latestLink = path.join(cwd, "runs", "latest");
    try { fs.unlinkSync(latestLink); } catch { /* ignore */ }
    try { fs.symlinkSync(runId, latestLink, "dir"); } catch { /* ignore */ }

    // Write run.json
    fs.writeFileSync(
      path.join(runsDir, "run.json"),
      JSON.stringify({
        run_id: runId,
        task_id: taskId,
        started_at: new Date().toISOString(),
        status: "in_progress",
        agent: task.assigned_agent,
      }, null, 2),
    );
  } catch {
    // directory creation failure is non-fatal
  }

  // Worker execution (stub - actual LLM integration in next phase)
  eventsRepo.append(db, {
    timestamp: new Date().toISOString(),
    run_id: runId,
    task_id: taskId,
    agent: task.assigned_agent,
    event: "worker_executed",
    summary: `Worker ${task.assigned_agent} processed task (stub - full LLM execution coming soon)`,
  });

  // Mark as REVIEW_PENDING
  tasksRepo.updateStatus(db, taskId, "REVIEW_PENDING");

  eventsRepo.append(db, {
    timestamp: new Date().toISOString(),
    run_id: runId,
    task_id: taskId,
    agent: task.assigned_agent,
    event: "awaiting_review",
    summary: `Task ${taskId} moved to REVIEW_PENDING`,
  });

  console.log(chalk.green(`\n✓ Task ${taskId} executed (stub — full LLM execution in next iteration)`));
  console.log(chalk.gray("  Status: REVIEW_PENDING — run /review to evaluate"));
  console.log(chalk.gray(`  Run:    ${runId}`));
}
