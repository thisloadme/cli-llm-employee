import chalk from "chalk";
import * as fs from "node:fs";
import * as yaml from "js-yaml";
import { getDb } from "../storage/db.js";
import * as docsRepo from "../storage/repos/documents.js";
import * as epicsRepo from "../storage/repos/epics.js";
import * as tasksRepo from "../storage/repos/tasks.js";
import { generateBacklog } from "../services/planner.js";
import { configExists } from "../config/loader.js";

export async function runPlanning(cwd: string): Promise<void> {
  if (!configExists(cwd)) {
    console.log(chalk.red("No .digital-team/config.yaml found. Run /init first."));
    return;
  }

  const db = getDb(cwd);
  const ingestedDocs = docsRepo.listByStatus(db, "ingested");

  if (ingestedDocs.length === 0) {
    console.log(chalk.yellow("No ingested documents found. Run /scan then /ingest first."));
    return;
  }

  console.log(chalk.bold("\nTeam Lead is analyzing documents...\n"));

  const documents = ingestedDocs.map((d) => {
    const docsDir = `${cwd}/docs/${d.doc_type}`;
    const filePath = d.processed_path
      ? `${docsDir}/${d.processed_path}`
      : `${docsDir}/${d.source_path}`;
    let content = "";
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      try {
        content = fs.readFileSync(`${cwd}/docs/inbox/${d.source_path}`, "utf8");
      } catch {
        content = `[Could not read file: ${d.source_path}]`;
      }
    }
    return {
      title: d.title || d.source_path,
      content,
      type: d.doc_type,
    };
  });

  try {
    const result = await generateBacklog(cwd, documents);

    // Save epic
    const epicId = result.epic.id || "EPIC-001";
    epicsRepo.create(db, {
      id: epicId,
      title: result.epic.title,
      source_docs: JSON.stringify(ingestedDocs.map((d) => d.source_path)),
      status: "planned",
    });

    // Save tasks to DB
    for (const task of result.tasks) {
      tasksRepo.create(db, task, epicId);
    }

    // Write backlog.yaml
    const backlogDir = `${cwd}/backlog`;
    if (!fs.existsSync(backlogDir)) fs.mkdirSync(backlogDir, { recursive: true });

    const backlogYaml = {
      epic_id: epicId,
      title: result.epic.title,
      source_docs: ingestedDocs.map((d) => `docs/${d.doc_type}/${d.processed_path || d.source_path}`),
      status: "planned",
      tasks: result.tasks.map((t) => t.id),
    };
    fs.writeFileSync(
      `${backlogDir}/backlog.yaml`,
      yaml.dump(backlogYaml, { lineWidth: 120 }),
    );

    // Write individual task files
    const tasksDir = `${backlogDir}/tasks`;
    if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });

    for (const task of result.tasks) {
      fs.writeFileSync(
        `${tasksDir}/${task.id}.yaml`,
        yaml.dump(task, { lineWidth: 120 }),
      );
    }

    // Mark docs as planned
    for (const doc of ingestedDocs) {
      docsRepo.updateStatus(db, doc.id, "planned");
    }

    console.log(chalk.green(`✓ Epic created: ${chalk.bold(epicId)} — ${result.epic.title}\n`));
    console.log(chalk.bold("Tasks generated:"));
    for (const task of result.tasks) {
      const priorityColor =
        task.priority === "critical" || task.priority === "high" ? chalk.red :
        task.priority === "medium" ? chalk.yellow : chalk.gray;
      console.log(
        `  ${chalk.cyan(task.id)}  ${priorityColor(`[${task.priority}]`)}  ${chalk.white(task.title)}  ${chalk.gray(`→ ${task.assigned_agent}`)}`,
      );
      if (task.depends_on.length > 0) {
        console.log(`    ${chalk.gray("depends on:")} ${task.depends_on.join(", ")}`);
      }
      console.log(`    ${chalk.gray("AC:")} ${task.acceptance_criteria.map((ac: string) => `"${ac}"`).join(", ")}`);
    }
    console.log(chalk.gray(`\n  Backlog saved to backlog/backlog.yaml`));
    console.log(chalk.gray(`  Task files saved to backlog/tasks/`));
    console.log(chalk.green(`\n✓ Planning complete. Run /run --next to execute the first task.`));
  } catch (err) {
    console.error(chalk.red(`\nPlanning failed: ${err instanceof Error ? err.message : String(err)}`));
    console.log(chalk.gray("Make sure your API keys are configured correctly with /config."));
  }
}
