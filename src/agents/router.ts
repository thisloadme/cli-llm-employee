import OpenAI from "openai";
import { loadConfig } from "../config/loader.js";
import type { AgentConfig } from "../config/schema.js";

export type AgentRole =
  | "team_lead"
  | "reviewer"
  | "backend-worker"
  | "frontend-worker"
  | "docs-test-worker";

export function getClientForRole(cwd: string, role: AgentRole): { client: OpenAI; model: string } {
  const config = loadConfig(cwd);

  if (role === "team_lead") {
    return createClient(config.team_lead);
  }
  if (role === "reviewer") {
    return createClient(config.reviewer);
  }

  const workerKey = role as "backend" | "frontend" | "docs-test";
  const worker = config.workers[workerKey];
  if (!worker.enabled) {
    throw new Error(`Worker '${role}' is disabled in config. Enable it with /config.`);
  }
  return createClient(worker);
}

function createClient(cfg: AgentConfig): { client: OpenAI; model: string } {
  return {
    client: new OpenAI({
      baseURL: cfg.base_url,
      apiKey: cfg.api_key || "sk-placeholder",
    }),
    model: cfg.model,
  };
}
