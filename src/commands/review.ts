import chalk from "chalk";
import { getDb } from "../storage/db.js";
import * as tasksRepo from "../storage/repos/tasks.js";
import * as reviewsRepo from "../storage/repos/reviews.js";
import * as eventsRepo from "../storage/repos/events.js";
import { configExists } from "../config/loader.js";
import type { Review } from "../schemas/backlog.js";

export async function reviewTaskCmd(cwd: string, taskId: string): Promise<void> {
  if (!configExists(cwd)) {
    console.log(chalk.red("No .digital-team/config.yaml found. Run /init first."));
    return;
  }

  const db = getDb(cwd);
  const row = tasksRepo.getById(db, taskId);

  if (!row) {
    console.log(chalk.red(`Task ${taskId} not found.`));
    return;
  }

  const task = tasksRepo.rowToTask(row);

  if (task.status !== "REVIEW_PENDING") {
    console.log(chalk.yellow(`Task ${taskId} is ${task.status}, not REVIEW_PENDING.`));
    return;
  }

  console.log(chalk.bold(`\nReviewing ${chalk.cyan(taskId)}: ${task.title}\n`));

  const runId = `review-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  eventsRepo.append(db, {
    timestamp: new Date().toISOString(),
    run_id: runId,
    task_id: taskId,
    agent: "reviewer",
    event: "review_started",
    summary: `Reviewing ${task.title}`,
  });

  // Stub review (full LLM review in next iteration)
  const review: Review = {
    task_id: taskId,
    verdict: "approved",
    score: 0.95,
    checks: {
      acceptance_match: true,
      scope_discipline: true,
      code_quality: true,
      regression_risk: 0.1,
      documentation_complete: true,
      test_sufficiency: true,
    },
    comments: [
      "All acceptance criteria met (stub review — full LLM review coming soon)",
      "Ready to proceed",
    ],
  };

  reviewsRepo.create(db, review);
  eventsRepo.append(db, {
    timestamp: new Date().toISOString(),
    run_id: runId,
    task_id: taskId,
    agent: "reviewer",
    event: "review_completed",
    summary: `Verdict: ${review.verdict} (score: ${review.score})`,
  });

  if (review.verdict === "approved") {
    tasksRepo.updateStatus(db, taskId, "DONE");
    console.log(chalk.green(`✓ Task ${taskId} APPROVED and marked DONE`));
  } else if (review.verdict === "changes_requested") {
    tasksRepo.updateStatus(db, taskId, "ASSIGNED");
    tasksRepo.incrementRetry(db, taskId);
    console.log(chalk.red(`✗ Task ${taskId}: CHANGES REQUESTED — back to ASSIGNED`));
  } else {
    tasksRepo.updateStatus(db, taskId, "BLOCKED");
    console.log(chalk.red(`✗ Task ${taskId} BLOCKED`));
  }

  console.log(`  Score:    ${chalk.yellow(review.score.toFixed(2))}`);
  console.log("  Checks:");
  for (const [check, passed] of Object.entries(review.checks)) {
    const icon = typeof passed === "boolean" ? (passed ? chalk.green("✓") : chalk.red("✗")) : chalk.gray("—");
    console.log(`    ${icon} ${check}`);
  }
  if (review.comments.length > 0) {
    console.log("  Comments:");
    for (const c of review.comments) {
      console.log(`    ${chalk.gray("•")} ${c}`);
    }
  }
  console.log("");
}
