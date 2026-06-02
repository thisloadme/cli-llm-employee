import { getClientForRole } from "../agents/router.js";
import { BacklogSchema, TaskSchema, type Backlog, type Task } from "../schemas/backlog.js";
import * as fs from "node:fs";
import * as path from "node:path";

const PLANNING_SYSTEM_PROMPT = `You are the Team Lead Agent for a software project. Your job is to read source documents (PRDs, specs, requirement docs) and break them into an executable task backlog.

## Rules:
- Create ONE epic that captures the overall goal.
- Break the work into small, focused tasks (3-8 tasks).
- Each task should be completable in one session by a specialist agent.
- Identify dependencies between tasks explicitly.
- Assign each task to the best specialist agent: "backend-worker", "frontend-worker", or "docs-test-worker".
- Write specific, measurable acceptance criteria for each task.
- Define scope (allowed paths) for each task.
- Do NOT write any code. Your output is the plan only.

## Output Format:
Return only valid YAML in this exact structure:

\`\`\`yaml
epic:
  id: EPIC-001
  title: "Epic Title"
  description: "Brief description of what this epic achieves"
tasks:
  - id: TASK-001
    title: "Short, specific task title"
    description: "Detailed description of what needs to be done"
    status: ASSIGNED
    priority: high
    assigned_agent: backend-worker
    depends_on: []
    acceptance_criteria:
      - "Specific, measurable criterion"
    scope:
      in:
        - src/path/to/allow
      out:
        - src/path/to/exclude
\`\`\`

## Agent Assignments:
- **backend-worker**: APIs, services, database, business logic, data models
- **frontend-worker**: UI components, pages, state management, user interactions
- **docs-test-worker**: Test suites, documentation, test plans, code quality

Return ONLY the YAML block, no other text.`;

export interface PlanningResult {
  epic: { id: string; title: string; description: string };
  tasks: Task[];
}

export async function generateBacklog(
  cwd: string,
  documents: Array<{ title: string; content: string; type: string }>,
): Promise<PlanningResult> {
  const { client, model } = getClientForRole(cwd, "team_lead");

  const docsContext = documents
    .map((d) => `## ${d.title} (${d.type})\n\n${d.content}`)
    .join("\n\n---\n\n");

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: PLANNING_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Here are the source documents. Analyze them and create a structured task backlog.\n\n${docsContext}`,
      },
    ],
    temperature: 0.3,
  });

  const rawOutput = response.choices[0]?.message?.content || "";
  const yamlMatch = rawOutput.match(/```yaml\n?([\s\S]*?)```/);
  const yamlContent = yamlMatch ? yamlMatch[1] : rawOutput;

  const parsed = parsePlanningYaml(yamlContent);

  const validatedTasks = parsed.tasks.map((t: Record<string, unknown>) => {
    const task = TaskSchema.parse({
      ...t,
      depends_on: t.depends_on || [],
      acceptance_criteria: t.acceptance_criteria || [],
      scope: t.scope || { in: [], out: [] },
    });
    return task;
  });

  return {
    epic: parsed.epic as PlanningResult["epic"],
    tasks: validatedTasks,
  };
}

function parsePlanningYaml(yamlStr: string): { epic: Record<string, unknown>; tasks: Record<string, unknown>[] } {
  // Simple YAML parser for the subset we need (avoids js-yaml dependency issues with complex LLM output)
  let currentSection: "epic" | "tasks" | null = null;
  const epic: Record<string, unknown> = {};
  const tasks: Record<string, unknown>[] = [];
  let currentTask: Record<string, unknown> | null = null;

  const lines = yamlStr.split("\n");
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("epic:")) {
      currentSection = "epic";
      continue;
    }
    if (trimmed.startsWith("tasks:")) {
      if (currentTask) {
        tasks.push({ ...currentTask });
        currentTask = null;
      }
      currentSection = "tasks";
      continue;
    }

    if (currentSection === "epic") {
      if (trimmed.startsWith("- ")) break;
      const match = trimmed.match(/^\s{2}(\w+):\s*"?(.+?)"?\s*$/);
      if (match) {
        epic[match[1]] = match[2];
      }
    }

    if (currentSection === "tasks") {
      if (trimmed.startsWith("  - id:")) {
        if (currentTask) {
          tasks.push({ ...currentTask });
        }
        currentTask = {};
        const match = trimmed.match(/- id:\s*"?(.+?)"?\s*$/);
        if (match) currentTask.id = match[1];
        continue;
      }

      if (currentTask) {
        // Top-level task fields
        const topMatch = trimmed.match(/^\s{4}(\w+):\s*"?(.+?)"?\s*$/);
        if (topMatch) {
          const key = topMatch[1];
          const val = topMatch[2];
          if (key === "depends_on") {
            currentTask[key] = val === "[]" || val === "" ? [] : [val.replace(/^\[|\]$/g, "")];
          } else {
            currentTask[key] = val;
          }
          continue;
        }

        // Nested fields (acceptance_criteria, scope)
        const nestedMatch = trimmed.match(/^\s{6}(\w+):\s*"?(.+?)"?\s*$/);
        if (nestedMatch) {
          const key = nestedMatch[1];
          const val = nestedMatch[2];
          if (!currentTask[key]) currentTask[key] = [];
          (currentTask[key] as string[]).push(val);
          continue;
        }

        // Scope sub-fields
        if (trimmed.trim() === "in:" || trimmed.trim() === "out:") {
          continue;
        }
        const scopeMatch = trimmed.match(/^\s{8}-\s+"?(.+?)"?\s*$/);
        if (scopeMatch) {
          if (!currentTask.scope) currentTask.scope = { in: [], out: [] };
          // Determine if we're in "in" or "out" by checking recent context
          const prevLine = lines[lines.indexOf(line) - 1];
          if (prevLine?.trim() === "out:") {
            (currentTask.scope as Record<string, string[]>).out.push(scopeMatch[1]);
          } else {
            (currentTask.scope as Record<string, string[]>).in.push(scopeMatch[1]);
          }
        }
      }
    }
  }

  if (currentTask) {
    tasks.push({ ...currentTask });
  }

  return { epic, tasks };
}
