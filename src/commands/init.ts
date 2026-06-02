import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";

const DIRS = [
  ".digital-team/agents",
  ".digital-team/policies",
  ".digital-team/prompts",
  ".digital-team/schemas",
  ".digital-team/memory",
  "docs/inbox",
  "docs/processed",
  "docs/prd",
  "docs/adr",
  "docs/specs",
  "backlog/tasks",
  "runs",
  "worktrees",
  "output",
];

const DEFAULT_CONFIG = `project_name: my-project
main_branch: main
max_parallel_tasks: 2
default_retry_limit: 2
review_required: true
allow_direct_merge: false
context:
  include_paths:
    - src
    - tests
    - docs
  exclude_paths:
    - node_modules
    - dist
    - vendor
workers:
  backend:
    enabled: true
    base_url: https://api.openai.com/v1
    api_key: ""
    model: gpt-4o
  frontend:
    enabled: true
    base_url: https://api.openai.com/v1
    api_key: ""
    model: gpt-4o
  docs-test:
    enabled: true
    base_url: https://api.openai.com/v1
    api_key: ""
    model: gpt-4o-mini
team_lead:
  base_url: https://api.openai.com/v1
  api_key: ""
  model: gpt-4o
reviewer:
  base_url: https://api.openai.com/v1
  api_key: ""
  model: gpt-4o
`;

const TEMPLATES: Record<string, string> = {
  ".digital-team/agents/team-lead.md": `# Team Lead Agent

You are the Team Lead Agent for this repository.
Your job is to read source documents, break them into executable tasks,
assign each task to the best specialist agent, and define clear acceptance criteria.

Do not write production code.
Do not approve your own work.
Return only valid YAML matching the task schema.
`,
  ".digital-team/agents/backend-worker.md": `# Backend Worker Agent

You are the Backend Worker Agent.
Your job is to implement backend services, APIs, database schemas,
migrations, and unit tests.

Stay within the task scope.
Do not touch frontend code unless the task explicitly requires it.
Do not merge to the main branch.
`,
  ".digital-team/agents/frontend-worker.md": `# Frontend Worker Agent

You are the Frontend Worker Agent.
Your job is to implement UI flows, components, state integration, and UI tests.

Stay within the task scope.
Do not touch backend code unless the task explicitly requires it.
Do not merge to the main branch.
`,
  ".digital-team/agents/docs-test-worker.md": `# Docs & Test Worker Agent

You are the Docs & Test Worker Agent.
Your job is to write test plans, unit/integration tests,
documentation updates, and changelogs.

Stay within the task scope.
Do not modify production code unless the task explicitly requires it.
`,
  ".digital-team/agents/reviewer.md": `# Reviewer Agent

You are the Reviewer Agent.
You must evaluate the completed work against the acceptance criteria,
diff summary, and test results.

Your job is to return one of: approved, changes_requested, blocked.
Do not rewrite the task scope.
Do not modify code during review.
Return structured JSON only.
`,
  ".digital-team/policies/coding-rules.md": `# Coding Rules

- Follow the established project coding style
- Write self-documenting code
- Add appropriate tests for all new code
- Keep changes minimal and focused
- Do not introduce breaking changes without explicit task requirements
`,
  ".digital-team/policies/review-rules.md": `# Review Rules

- Every task must pass review before being marked DONE
- Reviewer checks: acceptance criteria match, scope discipline, code quality, tests
- Changes requested tasks go back to ASSIGNED with feedback
- Blocked tasks need manual intervention
`,
  ".digital-team/policies/security-rules.md": `# Security Rules

- Never commit secrets or API keys
- Validate all user inputs
- Follow the principle of least privilege
- Do not execute arbitrary shell commands without guardrails
- Do not allow write access outside task scope
`,
  ".digital-team/policies/done-criteria.md": `# Done Criteria

A task is DONE when:
1. All acceptance criteria are met
2. Tests pass
3. Reviewer has approved
4. Code is within scope
5. No regressions introduced
6. Documentation is updated if needed
`,
  ".digital-team/prompts/planning.md": `# Planning Prompt

You are the Team Lead. Given the source document below, produce a structured backlog.

Output format (YAML):

\`\`\`yaml
epic_id: EPIC-001
title: "Epic Title"
source_docs:
  - docs/prd/source-doc.md
status: planned
tasks:
  - TASK-001
  - TASK-002
\`\`\`

For each task:

\`\`\`yaml
id: TASK-001
title: "Task Title"
description: "What needs to be done"
status: ASSIGNED
priority: high
assigned_agent: backend-worker
depends_on: []
acceptance_criteria:
  - "Criterion 1"
  - "Criterion 2"
scope:
  in:
    - src/path/to/allow
  out:
    - path/to/exclude
\`\`\`

Rules:
- Break work into small, focused tasks
- Each task should be completable in one session
- Identify dependencies explicitly
- Assign the most appropriate agent type
- Write specific, measurable acceptance criteria
`,
  ".digital-team/prompts/execution.md": `# Execution Prompt

You are a Worker Agent. Execute the assigned task according to the brief.

Rules:
- Only modify files within the allowed scope
- Write clean, idiomatic code
- Add appropriate tests
- Do not change the task scope
- Return a summary of changes made
`,
  ".digital-team/prompts/review.md": `# Review Prompt

You are the Reviewer. Evaluate the completed work.

Output format (JSON):

\`\`\`json
{
  "task_id": "TASK-001",
  "verdict": "approved | changes_requested | blocked",
  "score": 0.85,
  "checks": {
    "acceptance_match": true,
    "scope_discipline": true,
    "code_quality": true,
    "regression_risk": 0.1,
    "documentation_complete": true,
    "test_sufficiency": true
  },
  "comments": [
    "All criteria met",
    "Consider adding error handling for edge case X"
  ]
}
\`\`\`
`,
  ".digital-team/schemas/backlog.schema.json": JSON.stringify(
    {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["epic_id", "title", "source_docs", "status", "tasks"],
      properties: {
        epic_id: { type: "string", pattern: "^EPIC-\\d{3}$" },
        title: { type: "string", minLength: 1 },
        source_docs: { type: "array", items: { type: "string" } },
        status: { type: "string", enum: ["planned", "in_progress", "done"] },
        tasks: { type: "array", items: { type: "string", pattern: "^TASK-\\d{3}$" } },
      },
    },
    null,
    2,
  ),
  ".digital-team/schemas/task.schema.json": JSON.stringify(
    {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["id", "title", "status", "assigned_agent", "acceptance_criteria", "scope"],
      properties: {
        id: { type: "string", pattern: "^TASK-\\d{3}$" },
        title: { type: "string", minLength: 1 },
        description: { type: "string" },
        status: {
          type: "string",
          enum: ["INGESTED", "PLANNED", "ASSIGNED", "IN_PROGRESS", "REVIEW_PENDING", "CHANGES_REQUESTED", "DONE", "BLOCKED"],
        },
        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
        assigned_agent: { type: "string", enum: ["backend-worker", "frontend-worker", "docs-test-worker"] },
        depends_on: { type: "array", items: { type: "string" } },
        source_docs: { type: "array", items: { type: "string" } },
        acceptance_criteria: { type: "array", items: { type: "string" } },
        scope: {
          type: "object",
          required: ["in", "out"],
          properties: {
            in: { type: "array", items: { type: "string" } },
            out: { type: "array", items: { type: "string" } },
          },
        },
        execution: {
          type: "object",
          properties: {
            branch: { type: "string" },
            worktree: { type: "string" },
            retry_count: { type: "number" },
          },
        },
        review: {
          type: "object",
          properties: {
            required: { type: "boolean" },
            reviewer: { type: "string" },
          },
        },
      },
    },
    null,
    2,
  ),
  ".digital-team/schemas/review.schema.json": JSON.stringify(
    {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["task_id", "verdict", "score", "checks", "comments"],
      properties: {
        task_id: { type: "string" },
        verdict: { type: "string", enum: ["approved", "changes_requested", "blocked"] },
        score: { type: "number", minimum: 0, maximum: 1 },
        checks: {
          type: "object",
          properties: {
            acceptance_match: { type: "boolean" },
            scope_discipline: { type: "boolean" },
            code_quality: { type: "boolean" },
            regression_risk: { type: "number" },
            documentation_complete: { type: "boolean" },
            test_sufficiency: { type: "boolean" },
          },
        },
        comments: { type: "array", items: { type: "string" } },
      },
    },
    null,
    2,
  ),
  ".digital-team/memory/glossary.md": `# Domain Glossary

<!-- Define project-specific domain terms here -->
`,
  ".digital-team/memory/architecture-decisions.md": `# Architecture Decision Records

<!-- Record key architecture decisions here -->
`,
  ".digital-team/memory/product-context.md": `# Product Context

<!-- Define product context and vision here -->
`,
};

export async function initProject(cwd: string): Promise<void> {
  const dotDir = path.join(cwd, ".digital-team");

  if (fs.existsSync(dotDir)) {
    console.log(chalk.yellow("⚠ .digital-team/ already exists. Checking structure..."));
  }

  for (const dir of DIRS) {
    const fullPath = path.join(cwd, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(chalk.green(`  ✓ created ${dir}`));
    } else {
      console.log(chalk.gray(`  - ${dir} (exists)`));
    }
  }

  const configPath = path.join(cwd, ".digital-team", "config.yaml");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, DEFAULT_CONFIG);
    console.log(chalk.green("  ✓ created .digital-team/config.yaml"));
  } else {
    console.log(chalk.gray("  - .digital-team/config.yaml (exists, not overwritten)"));
  }

  for (const [filePath, content] of Object.entries(TEMPLATES)) {
    const fullPath = path.join(cwd, filePath);
    if (!fs.existsSync(fullPath)) {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content);
      console.log(chalk.green(`  ✓ created ${filePath}`));
    } else {
      console.log(chalk.gray(`  - ${filePath} (exists)`));
    }
  }

  console.log(chalk.bold("\n✓ Digital Team structure initialized!\n"));
  console.log("Next steps:");
  console.log("  1. /config  — configure your workers and API keys");
  console.log("  2. Drop a PRD or requirement doc into docs/inbox/");
  console.log("  3. /start   — scan, ingest, and plan");
}
