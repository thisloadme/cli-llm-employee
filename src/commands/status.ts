import chalk from "chalk";
import { getDb } from "../storage/db.js";
import * as docsRepo from "../storage/repos/documents.js";
import * as epicsRepo from "../storage/repos/epics.js";
import * as tasksRepo from "../storage/repos/tasks.js";
import { loadConfig, configExists } from "../config/loader.js";

export async function showStatus(cwd: string): Promise<void> {
  if (!configExists(cwd)) {
    console.log(chalk.red("No .digital-team/config.yaml found. Run /init first."));
    return;
  }

  const config = loadConfig(cwd);
  const db = getDb(cwd);

  const docCounts = { ingested: 0, planned: 0, total: 0 };
  try {
    docCounts.ingested = docsRepo.listByStatus(db, "ingested").length;
    docCounts.planned = docsRepo.listByStatus(db, "planned").length;
    docCounts.total = docsRepo.listAll(db).length;
  } catch { /* table might not exist yet */ }

  const taskCounts = tasksRepo.countByStatus(db);
  const epics = epicsRepo.listAll(db);

  console.log(chalk.bold.cyan(`\n═══ ${config.project_name} ═══\n`));
  console.log(`  Branch: ${chalk.gray(config.main_branch)}  |  Workers: ${chalk.gray(config.max_parallel_tasks)} max parallel  |  Review: ${chalk.gray(config.review_required ? "required" : "optional")}`);

  console.log(chalk.bold("\n  Documents:"));
  console.log(`    Inbox:     ${chalk.yellow(docCounts.ingested)} pending`);
  console.log(`    Processed: ${chalk.gray(docCounts.total - docCounts.ingested)}`);
  console.log(`    Total:     ${chalk.gray(docCounts.total)}`);

  console.log(chalk.bold("\n  Tasks:"));
  console.log(`    ${chalk.blue("PLANNED/ASSIGNED")}:  ${taskCounts["PLANNED"] || 0} / ${taskCounts["ASSIGNED"] || 0}`);
  console.log(`    ${chalk.blueBright("IN_PROGRESS")}:      ${taskCounts["IN_PROGRESS"] || 0}`);
  console.log(`    ${chalk.yellow("REVIEW_PENDING")}:   ${taskCounts["REVIEW_PENDING"] || 0}`);
  console.log(`    ${chalk.red("CHANGES_REQUESTED")}: ${taskCounts["CHANGES_REQUESTED"] || 0}`);
  console.log(`    ${chalk.green("DONE")}:              ${taskCounts["DONE"] || 0}`);
  console.log(`    ${chalk.red("BLOCKED")}:           ${taskCounts["BLOCKED"] || 0}`);
  const totalTasks = Object.values(taskCounts).reduce((a, b) => a + b, 0);
  console.log(chalk.gray(`    ───────────────────`));
  console.log(`    Total:           ${totalTasks}`);

  if (epics.length > 0) {
    console.log(chalk.bold("\n  Epics:"));
    for (const epic of epics) {
      const epicTasks = tasksRepo.listByEpic(db, epic.id);
      const doneCount = epicTasks.filter((t) => t.status === "DONE").length;
      console.log(`    ${chalk.cyan(epic.id)}  ${epic.title}  ${chalk.gray(`(${doneCount}/${epicTasks.length} done)`)}`);
    }
  }

  // Blocked tasks
  const blocked = tasksRepo.listByStatus(db, "BLOCKED");
  if (blocked.length > 0) {
    console.log(chalk.bold(`\n  ${chalk.red("Blocked Tasks:")}`));
    for (const t of blocked) {
      console.log(`    ${chalk.red("■")} ${chalk.cyan(t.id)}  ${t.title}`);
    }
  }

  if (totalTasks === 0) {
    console.log(chalk.gray("\n  No tasks yet. Drop a PRD in docs/inbox/ and run /start."));
  }

  // Active workers
  console.log(chalk.bold("\n  Workers:"));
  for (const [name, worker] of Object.entries(config.workers)) {
    const status = worker.api_key ? chalk.green("configured") : chalk.red("no API key");
    console.log(`    ${name.padEnd(12)} ${status}  ${chalk.gray(worker.model)}`);
  }
  console.log(`    ${"team-lead".padEnd(12)} ${config.team_lead.api_key ? chalk.green("configured") : chalk.red("no API key")}  ${chalk.gray(config.team_lead.model)}`);
  console.log(`    ${"reviewer".padEnd(12)} ${config.reviewer.api_key ? chalk.green("configured") : chalk.red("no API key")}  ${chalk.gray(config.reviewer.model)}`);

  console.log("");
}
