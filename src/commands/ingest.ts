import chalk from "chalk";
import { configExists } from "../config/loader.js";

export async function ingestDocs(cwd: string): Promise<void> {
  if (!configExists(cwd)) {
    console.log(chalk.red("No .digital-team/config.yaml found. Run /init first."));
    return;
  }

  const { ingestAll } = await import("../services/ingestor.js");
  const results = ingestAll(cwd);

  if (results.length === 0) {
    console.log(chalk.gray("No new documents to ingest. Run /scan first."));
    return;
  }

  console.log(chalk.bold(`\nIngested ${results.length} document(s):\n`));
  for (const r of results) {
    console.log(`  ${chalk.cyan(r.filename)}`);
    console.log(`    Type: ${r.type}  |  Title: ${chalk.yellow(r.title)}`);
    console.log(`    Saved: ${chalk.gray(r.destination)}`);
  }
  console.log(chalk.green("\n✓ Documents ingested. Run /plan to generate the task backlog."));
}
