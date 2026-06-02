import chalk from "chalk";
import { configExists } from "../config/loader.js";

export interface StartOptions {
  skipScan?: boolean;
  skipIngest?: boolean;
  epic?: string;
}

export async function startPipeline(cwd: string, opts: StartOptions): Promise<void> {
  if (!configExists(cwd)) {
    console.log(chalk.red("No .digital-team/config.yaml found. Run /init first."));
    return;
  }

  console.log(chalk.bold.cyan("\n═══ Virtual Team Starting ═══\n"));

  // Step 1: Scan
  if (!opts.skipScan) {
    console.log(chalk.bold("[1/3] Scanning docs/inbox/..."));
    const { scanInbox } = await import("../commands/scan.js");
    await scanInbox(cwd);
  }

  // Step 2: Ingest
  if (!opts.skipIngest) {
    console.log(chalk.bold("\n[2/3] Ingesting documents..."));
    const { ingestDocs } = await import("../commands/ingest.js");
    await ingestDocs(cwd);
  }

  // Step 3: Plan
  console.log(chalk.bold("\n[3/3] Team Lead generating backlog..."));
  const { runPlanning } = await import("../commands/plan.js");
  await runPlanning(cwd);

  console.log(chalk.bold.green("\n═══ Virtual Team Ready ═══"));
  console.log(chalk.gray("Run /status to see the dashboard."));
  console.log(chalk.gray("Run /run --next to execute the first ready task."));
}
