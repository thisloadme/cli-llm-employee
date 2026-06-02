import * as readline from "node:readline";
import chalk from "chalk";
import { loadConfig, saveConfig, configExists } from "../config/loader.js";
import type { ProjectConfig } from "../config/schema.js";

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

export async function configure(cwd: string): Promise<void> {
  if (!configExists(cwd)) {
    console.log(chalk.red("No .digital-team/config.yaml found. Run /init first."));
    return;
  }

  const config = loadConfig(cwd);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.bold("\n⚙  Virtual Team Configuration\n"));
  console.log(chalk.gray("Press Enter to keep current value. Type 'skip' to skip a section.\n"));

  // Project name
  const projectName = await ask(rl, `Project name [${config.project_name}]: `);
  if (projectName) config.project_name = projectName;

  // Worker configuration
  await configureWorker(rl, "backend", config);
  await configureWorker(rl, "frontend", config);
  await configureWorker(rl, "docs-test", config);

  // Team Lead
  console.log(chalk.cyan("\n── Team Lead Agent ──"));
  await configureAgent(rl, "team_lead", config);

  // Reviewer
  console.log(chalk.cyan("\n── Reviewer Agent ──"));
  await configureAgent(rl, "reviewer", config);

  // General settings
  console.log(chalk.cyan("\n── General Settings ──"));
  const maxParallel = await ask(rl, `Max parallel tasks [${config.max_parallel_tasks}]: `);
  if (maxParallel) {
    const n = parseInt(maxParallel);
    if (!isNaN(n) && n > 0) config.max_parallel_tasks = n;
  }

  const retryLimit = await ask(rl, `Default retry limit [${config.default_retry_limit}]: `);
  if (retryLimit) {
    const n = parseInt(retryLimit);
    if (!isNaN(n) && n >= 0) config.default_retry_limit = n;
  }

  const reviewRequired = await ask(rl, `Review required? (yes/no) [${config.review_required ? "yes" : "no"}]: `);
  if (reviewRequired) {
    config.review_required = reviewRequired.toLowerCase().startsWith("y");
  }

  rl.close();

  saveConfig(cwd, config);
  console.log(chalk.green("\n✓ Configuration saved to .digital-team/config.yaml\n"));

  printSummary(config);
}

async function configureWorker(
  rl: readline.Interface,
  name: "backend" | "frontend" | "docs-test",
  config: ProjectConfig,
) {
  console.log(chalk.cyan(`\n── ${name.toUpperCase()} Worker ──`));
  const worker = config.workers[name];

  const enabled = await ask(rl, `  Enable? (yes/no) [${worker.enabled ? "yes" : "no"}]: `);
  if (enabled) {
    worker.enabled = enabled.toLowerCase().startsWith("y");
  }

  if (!worker.enabled) {
    console.log(chalk.gray(`  ${name} worker disabled. Skipping...`));
    return;
  }

  const baseUrl = await ask(rl, `  Base URL [${worker.base_url}]: `);
  if (baseUrl) worker.base_url = baseUrl;

  const apiKey = await ask(rl, `  API Key [${worker.api_key ? "***" : "(empty)"}]: `);
  if (apiKey) worker.api_key = apiKey;

  const model = await ask(rl, `  Model [${worker.model}]: `);
  if (model) worker.model = model;
}

async function configureAgent(
  rl: readline.Interface,
  key: "team_lead" | "reviewer",
  config: ProjectConfig,
) {
  const agent = config[key];

  const baseUrl = await ask(rl, `  Base URL [${agent.base_url}]: `);
  if (baseUrl) agent.base_url = baseUrl;

  const apiKey = await ask(rl, `  API Key [${agent.api_key ? "***" : "(empty)"}]: `);
  if (apiKey) agent.api_key = apiKey;

  const model = await ask(rl, `  Model [${agent.model}]: `);
  if (model) agent.model = model;
}

function printSummary(config: ProjectConfig) {
  console.log(chalk.bold("Active Workers:"));
  for (const [name, worker] of Object.entries(config.workers)) {
    const status = worker.enabled ? chalk.green("ENABLED") : chalk.gray("DISABLED");
    const modelInfo = worker.enabled
      ? `${worker.model} @ ${worker.base_url}`
      : "";
    console.log(`  ${name.padEnd(12)} ${status}  ${chalk.gray(modelInfo)}`);
  }
  console.log(`  ${"team-lead".padEnd(12)} ${chalk.blue(config.team_lead.model)} @ ${config.team_lead.base_url}`);
  console.log(`  ${"reviewer".padEnd(12)} ${chalk.blue(config.reviewer.model)} @ ${config.reviewer.base_url}`);
  console.log(`\n  max_parallel: ${config.max_parallel_tasks}  |  retry_limit: ${config.default_retry_limit}  |  review: ${config.review_required ? "on" : "off"}`);
}
