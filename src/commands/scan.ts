import chalk from "chalk";
import { configExists } from "../config/loader.js";

export async function scanInbox(cwd: string): Promise<void> {
  if (!configExists(cwd)) {
    console.log(chalk.red("No .digital-team/config.yaml found. Run /init first."));
    return;
  }

  const { Scanner } = await import("../services/scanner.js");
  const scanner = new Scanner(cwd);
  const files = scanner.scan();

  if (files.length === 0) {
    console.log(chalk.gray("No new documents found in docs/inbox/."));
    console.log(chalk.gray("Drop a .md, .txt, .yaml, or .json file there and run /scan again."));
    return;
  }

  console.log(chalk.bold(`\nFound ${files.length} document(s) in docs/inbox/:\n`));
  for (const file of files) {
    console.log(`  ${chalk.cyan(file.name)}  ${chalk.gray(`(${file.size} bytes, ${file.mtime.toISOString()})`)}`);
  }
  console.log(chalk.gray("\nRun /ingest to process these documents."));
}
