import chalk from "chalk";
import * as fs from "node:fs";
import * as path from "node:path";
import { getDb } from "../storage/db.js";
import * as eventsRepo from "../storage/repos/events.js";
import { configExists } from "../config/loader.js";

export interface LogOptions {
  run?: string;
  task?: string;
}

export async function showLogs(cwd: string, opts: LogOptions): Promise<void> {
  if (!configExists(cwd)) {
    console.log(chalk.red("No .digital-team/config.yaml found. Run /init first."));
    return;
  }

  const db = getDb(cwd);

  if (opts.run) {
    let runId = opts.run;
    if (runId === "latest") {
      const runsDir = path.join(cwd, "runs");
      if (fs.existsSync(runsDir)) {
        const runs = fs.readdirSync(runsDir).filter((d) => d.startsWith("20"));
        runs.sort().reverse();
        if (runs.length > 0) {
          runId = runs[0];
        } else {
          console.log(chalk.gray("No runs found."));
          return;
        }
      } else {
        console.log(chalk.gray("No runs directory found."));
        return;
      }
    }

    const events = eventsRepo.listByRunId(db, runId);
    if (events.length === 0) {
      console.log(chalk.gray(`No events found for run ${runId}.`));
      return;
    }

    console.log(chalk.bold(`\nRun: ${runId} (${events.length} events)\n`));
    for (const event of events) {
      console.log(
        `  ${chalk.gray(event.timestamp)}  ${chalk.cyan(event.event.padEnd(20))}  ${event.agent.padEnd(15)}  ${event.summary || ""}`,
      );
    }
    return;
  }

  if (opts.task) {
    const events = eventsRepo.listByTaskId(db, opts.task);
    if (events.length === 0) {
      console.log(chalk.gray(`No events found for task ${opts.task}.`));
      return;
    }

    console.log(chalk.bold(`\nTask: ${opts.task} (${events.length} events)\n`));
    for (const event of events) {
      console.log(
        `  ${chalk.gray(event.timestamp)}  ${chalk.cyan(event.event.padEnd(20))}  ${event.summary || ""}`,
      );
    }
    return;
  }

  // Default: recent events
  const events = eventsRepo.listRecent(db, 30);
  if (events.length === 0) {
    console.log(chalk.gray("No events recorded yet. Run some tasks to generate events."));
    return;
  }

  console.log(chalk.bold(`\nRecent events (${events.length}):\n`));
  for (const event of events) {
    console.log(
      `  ${chalk.gray(event.timestamp)}  ${chalk.cyan(event.event.padEnd(20))}  ${event.agent.padEnd(15)}  ${chalk.gray(event.task_id || "")}  ${event.summary || ""}`,
    );
  }
}
