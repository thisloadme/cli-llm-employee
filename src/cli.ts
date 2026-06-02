#!/usr/bin/env node
import { Command } from "commander";
import { startRepl } from "./repl.js";

const program = new Command()
  .name("dteam")
  .description("Digital Team CLI — multi-agent LLM orchestration")
  .version("0.1.0");

program
  .command("init")
  .description("Create .digital-team/ structure in current directory")
  .action(async () => {
    const { initProject } = await import("./commands/init.js");
    await initProject(process.cwd());
  });

program
  .command("config")
  .description("Interactive worker configuration")
  .action(async () => {
    const { configure } = await import("./commands/config.js");
    await configure(process.cwd());
  });

program
  .command("start")
  .description("Run full scan + ingest + plan pipeline")
  .option("--skip-scan", "Skip document scanning")
  .option("--skip-ingest", "Skip document ingestion")
  .action(async (opts) => {
    const { startPipeline } = await import("./commands/start.js");
    await startPipeline(process.cwd(), opts);
  });

program
  .command("scan")
  .description("Scan docs/inbox/ for new documents")
  .action(async () => {
    const { scanInbox } = await import("./commands/scan.js");
    await scanInbox(process.cwd());
  });

program
  .command("ingest")
  .description("Process and categorize documents from inbox")
  .action(async () => {
    const { ingestDocs } = await import("./commands/ingest.js");
    await ingestDocs(process.cwd());
  });

program
  .command("plan")
  .description("Run Team Lead to generate task backlog")
  .action(async () => {
    const { runPlanning } = await import("./commands/plan.js");
    await runPlanning(process.cwd());
  });

program
  .command("tasks")
  .argument("[action]", "list or show")
  .argument("[id]", "Task ID for show")
  .description("List all tasks or show task detail")
  .action(async (action, id) => {
    const { handleTasks } = await import("./commands/tasks.js");
    await handleTasks(process.cwd(), action || "list", id);
  });

program
  .command("run")
  .argument("[task-id]", "Task ID to run")
  .option("--next", "Run next eligible task")
  .option("--epic <id>", "Run all tasks in an epic")
  .description("Execute task(s)")
  .action(async (taskId, opts) => {
    const { runTask } = await import("./commands/run.js");
    await runTask(process.cwd(), taskId, opts);
  });

program
  .command("review")
  .argument("<task-id>", "Task ID to review")
  .description("Run reviewer on completed task")
  .action(async (taskId) => {
    const { reviewTaskCmd } = await import("./commands/review.js");
    await reviewTaskCmd(process.cwd(), taskId);
  });

program
  .command("status")
  .description("Show project status dashboard")
  .action(async () => {
    const { showStatus } = await import("./commands/status.js");
    await showStatus(process.cwd());
  });

program
  .command("logs")
  .description("Show run logs")
  .option("--run <id>", "Run ID or 'latest'")
  .option("--task <id>", "Filter by task ID")
  .action(async (opts) => {
    const { showLogs } = await import("./commands/logs.js");
    await showLogs(process.cwd(), opts);
  });

program
  .command("tui")
  .description("Launch interactive TUI dashboard")
  .action(async () => {
    const { launchTui } = await import("./tui/app.js");
    await launchTui(process.cwd());
  });

if (process.argv.length <= 2) {
  startRepl(program);
} else {
  program.parse();
}
