import { getClientForRole } from "./router.js";
import { getSystemPrompt } from "./router.js";
import type { AgentRole } from "./router.js";
import type { Task } from "../schemas/backlog.js";
import type { Message } from "../schemas/message.js";

export interface WorkerResult {
  output: string;
}

function buildTaskContext(task: Task): string {
  const parts: string[] = [];

  parts.push(`## Task: ${task.id} — ${task.title}`);
  if (task.description) {
    parts.push(`\n### Description\n${task.description}`);
  }

  if (task.acceptance_criteria.length > 0) {
    parts.push(`\n### Acceptance Criteria`);
    for (const ac of task.acceptance_criteria) {
      parts.push(`- ${ac}`);
    }
  }

  if (task.scope.in.length > 0) {
    parts.push(`\n### Allowed Paths (scope.in)`);
    for (const p of task.scope.in) {
      parts.push(`- ${p}`);
    }
  }

  if (task.scope.out.length > 0) {
    parts.push(`\n### Forbidden Paths (scope.out)`);
    for (const p of task.scope.out) {
      parts.push(`- ${p}`);
    }
  }

  return parts.join("\n");
}

export async function runWorkerAgent(
  cwd: string,
  role: AgentRole,
  task: Task,
  delegationMessage: string,
  history: Message[],
): Promise<WorkerResult> {
  const { client, model } = getClientForRole(cwd, role);
  const systemPrompt = getSystemPrompt(role);
  const taskContext = buildTaskContext(task);

  const fullSystemPrompt = `${systemPrompt}\n\n## Current Task\n${taskContext}`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: fullSystemPrompt },
  ];

  for (const msg of history) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: `[User]: ${msg.content}` });
    } else if (msg.role === "team_lead") {
      messages.push({ role: "assistant", content: `[Team Lead]: ${msg.content}` });
    } else if (msg.role === "worker") {
      messages.push({ role: "assistant", content: `[${msg.agent}]: ${msg.content}` });
    }
  }

  messages.push({ role: "user", content: `[Team Lead]: ${delegationMessage}` });

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content || "";

  return { output: content };
}
