import chalk from "chalk";
import { getDb } from "../storage/db.js";
import * as tasksRepo from "../storage/repos/tasks.js";
import { configExists } from "../config/loader.js";

export async function handleTasks(cwd: string, action: string, id?: string): Promise<void> {
  if (!configExists(cwd)) {
    console.log(chalk.red("No .digital-team/config.yaml found. Run /init first."));
    return;
  }

  const db = getDb(cwd);

  if (action === "show" && id) {
    const row = tasksRepo.getById(db, id);
    if (!row) {
      console.log(chalk.red(`Task ${id} not found.`));
      return;
    }
    const task = tasksRepo.rowToTask(row);
    console.log(chalk.bold(`\n${task.id}: ${task.title}\n`));
    console.log(`  Status:      ${statusBadge(task.status)}`);
    console.log(`  Priority:    ${task.priority}`);
    console.log(`  Agent:       ${task.assigned_agent}`);
    console.log(`  Depends on:  ${task.depends_on.length > 0 ? task.depends_on.join(", ") : "none"}`);
    console.log(`  Retries:     ${task.execution?.retry_count || 0}`);
    if (task.description) {
      console.log(`\n  Description:`);
      console.log(`    ${task.description}`);
    }
    console.log(`\n  Acceptance Criteria:`);
    for (const ac of task.acceptance_criteria) {
      console.log(`    • ${ac}`);
    }
    console.log(`\n  Scope:`);
    console.log(`    In:  ${task.scope.in.length > 0 ? task.scope.in.join(", ") : "(all)"}`);
    console.log(`    Out: ${task.scope.out.length > 0 ? task.scope.out.join(", ") : "(none)"}`);
    if (task.execution?.worktree) {
      console.log(`\n  Worktree:    ${task.execution.worktree}`);
      console.log(`  Branch:      ${task.execution.branch}`);
    }
    return;
  }

  // list
  const tasks = tasksRepo.listAll(db);
  if (tasks.length === 0) {
    console.log(chalk.gray("No tasks yet. Run /start to generate the backlog."));
    return;
  }

  console.log(chalk.bold(`\nTasks (${tasks.length}):\n`));
  for (const row of tasks) {
    const task = tasksRepo.rowToTask(row);
    console.log(
      `  ${chalk.cyan(task.id)}  ${statusBadge(task.status)}  ${task.title}  ${chalk.gray(`→ ${task.assigned_agent}`)}`,
    );
  }
}

function statusBadge(status: string): string {
  switch (status) {
    case "INGESTED": return chalk.gray("[INGESTED]");
    case "PLANNED": return chalk.blue("[PLANNED]");
    case "ASSIGNED": return chalk.blue("[ASSIGNED]");
    case "IN_PROGRESS": return chalk.blueBright("[IN_PROGRESS]");
    case "REVIEW_PENDING": return chalk.yellow("[REVIEW]");
    case "CHANGES_REQUESTED": return chalk.red("[CHANGES]");
    case "DONE": return chalk.green("[DONE]");
    case "BLOCKED": return chalk.red("[BLOCKED]");
    default: return chalk.gray(`[${status}]`);
  }
}
