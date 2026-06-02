import chalk from "chalk";
import { configExists } from "../config/loader.js";
import { getDb } from "../storage/db.js";
import * as tasksRepo from "../storage/repos/tasks.js";
import * as eventsRepo from "../storage/repos/events.js";

export async function launchTui(cwd: string): Promise<void> {
  if (!configExists(cwd)) {
    console.log(chalk.red("No .digital-team/config.yaml found. Run /init first."));
    return;
  }

  const db = getDb(cwd);

  // Simple TUI using raw terminal output (ink-based TUI coming in a future iteration)
  console.log(chalk.bold.cyan("\n═══ Digital Team Dashboard ═══\n"));

  const tasks = tasksRepo.listAll(db);
  const events = eventsRepo.listRecent(db, 20);

  // Task table
  if (tasks.length > 0) {
    console.log(chalk.bold("Tasks:"));
    console.log("─".repeat(80));
    for (const row of tasks) {
      const task = tasksRepo.rowToTask(row);
      const statusIcon = statusToIcon(task.status);
      console.log(
        `  ${chalk.cyan(task.id)}  ${statusIcon}  ${task.title.slice(0, 50).padEnd(50)}  ${chalk.gray(task.assigned_agent)}`,
      );
    }
    console.log("─".repeat(80));
  } else {
    console.log(chalk.gray("No tasks yet. Run /start to generate the backlog."));
  }

  // Recent events
  if (events.length > 0) {
    console.log(chalk.bold("\nRecent Events:"));
    console.log("─".repeat(80));
    for (const event of events.slice(-10)) {
      console.log(
        `  ${chalk.gray(event.timestamp.slice(11, 19))}  ${event.event.padEnd(20)}  ${event.summary || ""}`,
      );
    }
    console.log("─".repeat(80));
  }

  console.log(chalk.gray("\nPress Ctrl+C to exit. Full interactive TUI coming soon.\n"));
}

function statusToIcon(status: string): string {
  switch (status) {
    case "INGESTED": return chalk.gray("◌");
    case "PLANNED": return chalk.blue("◉");
    case "ASSIGNED": return chalk.blue("◎");
    case "IN_PROGRESS": return chalk.blueBright("◑");
    case "REVIEW_PENDING": return chalk.yellow("◐");
    case "CHANGES_REQUESTED": return chalk.red("◒");
    case "DONE": return chalk.green("●");
    case "BLOCKED": return chalk.red("■");
    default: return chalk.gray("○");
  }
}
