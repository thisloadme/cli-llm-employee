import { z } from "zod";

export const TaskStatus = z.enum([
  "INGESTED",
  "PLANNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "REVIEW_PENDING",
  "CHANGES_REQUESTED",
  "DONE",
  "BLOCKED",
]);

export const Priority = z.enum(["low", "medium", "high", "critical"]);

export const AgentName = z.enum([
  "backend-worker",
  "frontend-worker",
  "docs-test-worker",
]);

export const Verdict = z.enum(["approved", "changes_requested", "blocked"]);

export const TaskSchema = z.object({
  id: z.string().regex(/^TASK-\d{3}$/),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  status: TaskStatus,
  priority: Priority.optional().default("medium"),
  assigned_agent: AgentName,
  depends_on: z.array(z.string()).optional().default([]),
  source_docs: z.array(z.string()).optional().default([]),
  acceptance_criteria: z.array(z.string()).optional().default([]),
  scope: z.object({
    in: z.array(z.string()).optional().default([]),
    out: z.array(z.string()).optional().default([]),
  }).optional().default({ in: [], out: [] }),
  execution: z.object({
    branch: z.string().optional(),
    worktree: z.string().optional(),
    retry_count: z.number().int().min(0).optional(),
  }).optional(),
  review: z.object({
    required: z.boolean().optional().default(true),
    reviewer: z.string().optional().default("reviewer"),
  }).optional().default({ required: true, reviewer: "reviewer" }),
});

export const BacklogSchema = z.object({
  epic_id: z.string().regex(/^EPIC-\d{3}$/),
  title: z.string().min(1),
  source_docs: z.array(z.string()).optional().default([]),
  status: z.enum(["planned", "in_progress", "done"]).optional().default("planned"),
  tasks: z.array(z.string()).optional().default([]),
});

export const ReviewSchema = z.object({
  task_id: z.string(),
  verdict: Verdict,
  score: z.number().min(0).max(1),
  checks: z.object({
    acceptance_match: z.boolean().optional().default(false),
    scope_discipline: z.boolean().optional().default(false),
    code_quality: z.boolean().optional().default(false),
    regression_risk: z.number().min(0).max(1).optional().default(0),
    documentation_complete: z.boolean().optional().default(false),
    test_sufficiency: z.boolean().optional().default(false),
  }),
  comments: z.array(z.string()).optional().default([]),
});

export const AgentEventSchema = z.object({
  timestamp: z.string(),
  run_id: z.string(),
  task_id: z.string().optional(),
  agent: z.string(),
  event: z.string(),
  model: z.string().optional(),
  input_refs: z.array(z.string()).optional(),
  worktree: z.string().optional(),
  summary: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;
export type Backlog = z.infer<typeof BacklogSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
