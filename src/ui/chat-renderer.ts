import chalk from "chalk";
import type { Message } from "../schemas/message.js";

type ChalkFn = (text: string) => string;

const AGENT_COLORS: Record<string, ChalkFn> = {
  "Team Lead": chalk.bold.blue,
  Reviewer: chalk.magenta,
  You: chalk.green,
};

const AGENT_EMOJI: Record<string, string> = {
  "Team Lead": "\u{1F916}",
  Reviewer: "\u{1F50D}",
  You: "\u{1F464}",
};

const WORKER_EMOJI: Record<string, string> = {
  "Backend Worker": "\u{1F527}",
  "Frontend Worker": "\u{1F3A8}",
  "Docs & Test Worker": "\u{1F4DD}",
};

function agentLabel(msg: Message): string {
  if (msg.role === "worker") {
    const emoji = WORKER_EMOJI[msg.agent] || "\u{1F527}";
    return chalk.cyan(`${emoji} ${msg.agent}:`);
  }
  const color = AGENT_COLORS[msg.agent] || chalk.white;
  const emoji = AGENT_EMOJI[msg.agent] || "";
  return color(`${emoji} ${msg.agent}:`.trim());
}

export function renderMessage(msg: Message): string {
  const label = agentLabel(msg);
  const content = msg.content.includes("\n")
    ? `\n${msg.content}`
    : ` ${msg.content}`;
  return `${label}${content}`;
}

export function renderTaskBanner(taskId: string, title: string): string {
  return [
    chalk.gray("\u2501".repeat(60)),
    `${chalk.bold.cyan("\u{1F4CB}")} ${chalk.bold(taskId)} \u2014 ${title}`,
    "",
  ].join("\n");
}

export function renderTaskComplete(taskId: string): string {
  return chalk.green(`\u2705 ${taskId} complete.\n`);
}

export function renderSeparator(): string {
  return chalk.gray("\u2500".repeat(60));
}

export function renderSummary(completed: number, blocked: number): string {
  const parts: string[] = [];
  if (completed > 0) parts.push(chalk.green(`${completed} completed`));
  if (blocked > 0) parts.push(chalk.red(`${blocked} blocked`));
  if (parts.length === 0) parts.push(chalk.yellow("No tasks processed"));
  return chalk.bold(`\nSummary: ${parts.join(", ")}`);
}

export function renderHeader(): string {
  return chalk.bold.gray("========================================\n  dteam run — Autonomous Orchestration\n========================================\n");
}
