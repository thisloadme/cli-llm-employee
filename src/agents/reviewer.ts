import { getClientForRole } from "./router.js";
import { getSystemPrompt } from "./router.js";
import { ReviewSchema, type Review, type Task } from "../schemas/backlog.js";
import type { Message } from "../schemas/message.js";

function buildReviewContext(task: Task, workerOutput: string): string {
  const parts: string[] = [];

  parts.push(`## Task to Review: ${task.id} — ${task.title}`);
  if (task.description) {
    parts.push(`\n### Task Description\n${task.description}`);
  }

  if (task.acceptance_criteria.length > 0) {
    parts.push(`\n### Acceptance Criteria`);
    for (const ac of task.acceptance_criteria) {
      parts.push(`- ${ac}`);
    }
  }

  if (task.scope.in.length > 0) {
    parts.push(`\n### Allowed Paths`);
    for (const p of task.scope.in) {
      parts.push(`- ${p}`);
    }
  }

  parts.push(`\n### Worker Output\n${workerOutput}`);

  return parts.join("\n");
}

function parseReviewJson(text: string): Record<string, unknown> | null {
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === "object" && "verdict" in parsed) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function runReviewerAgent(
  cwd: string,
  task: Task,
  workerOutput: string,
  history: Message[],
): Promise<Review> {
  const { client, model } = getClientForRole(cwd, "reviewer");
  const systemPrompt = getSystemPrompt("reviewer");
  const reviewContext = buildReviewContext(task, workerOutput);

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: reviewContext },
  ];

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content || "";
    const parsed = parseReviewJson(content);

    const defaultChecks = {
      acceptance_match: false,
      scope_discipline: false,
      code_quality: false,
      regression_risk: 0,
      documentation_complete: false,
      test_sufficiency: false,
    };

    if (parsed) {
      return ReviewSchema.parse({
        task_id: task.id,
        verdict: parsed.verdict,
        score: parsed.score,
        checks: { ...defaultChecks, ...(parsed.checks || {}) },
        comments: parsed.comments || [],
      });
    }

    return {
      task_id: task.id,
      verdict: "changes_requested",
      score: 0,
      checks: defaultChecks,
      comments: [`Failed to parse reviewer output. Raw response: ${content.slice(0, 200)}`],
    };
  } catch (err) {
    if (err instanceof Error && err.constructor.name === "ZodError") {
      return {
        task_id: task.id,
        verdict: "changes_requested",
        score: 0,
        checks: {
          acceptance_match: false,
          scope_discipline: false,
          code_quality: false,
          regression_risk: 0,
          documentation_complete: false,
          test_sufficiency: false,
        },
        comments: [`Invalid review format: ${(err as Error).message.slice(0, 200)}`],
      };
    }
    throw err;
  }
}
