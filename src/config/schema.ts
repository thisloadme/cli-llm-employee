import { z } from "zod";

export const WorkerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  base_url: z.string().url().default("https://api.openai.com/v1"),
  api_key: z.string().default(""),
  model: z.string().default("gpt-4o"),
});

export const AgentConfigSchema = z.object({
  base_url: z.string().url().default("https://api.openai.com/v1"),
  api_key: z.string().default(""),
  model: z.string().default("gpt-4o"),
});

export const ProjectConfigSchema = z.object({
  project_name: z.string().default("my-project"),
  main_branch: z.string().default("main"),
  max_parallel_tasks: z.number().int().min(1).default(2),
  default_retry_limit: z.number().int().min(0).default(2),
  review_required: z.boolean().default(true),
  allow_direct_merge: z.boolean().default(false),
  context: z.object({
    include_paths: z.array(z.string()).default(["src", "tests", "docs"]),
    exclude_paths: z.array(z.string()).default(["node_modules", "dist", "vendor"]),
  }).default({ include_paths: ["src", "tests", "docs"], exclude_paths: ["node_modules", "dist", "vendor"] }),
  workers: z.object({
    backend: WorkerConfigSchema,
    frontend: WorkerConfigSchema,
    "docs-test": WorkerConfigSchema,
  }).default({
    backend: { enabled: true, base_url: "https://api.openai.com/v1", api_key: "", model: "gpt-4o" },
    frontend: { enabled: true, base_url: "https://api.openai.com/v1", api_key: "", model: "gpt-4o" },
    "docs-test": { enabled: true, base_url: "https://api.openai.com/v1", api_key: "", model: "gpt-4o-mini" },
  }),
  team_lead: AgentConfigSchema.default({ base_url: "https://api.openai.com/v1", api_key: "", model: "gpt-4o" }),
  reviewer: AgentConfigSchema.default({ base_url: "https://api.openai.com/v1", api_key: "", model: "gpt-4o" }),
});

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
