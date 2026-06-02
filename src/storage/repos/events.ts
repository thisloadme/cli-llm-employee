import type Database from "better-sqlite3";
import type { AgentEvent } from "../../schemas/backlog.js";

export function append(db: Database.Database, event: AgentEvent): void {
  db.prepare(`
    INSERT INTO agent_events (run_id, task_id, agent, event, model, input_refs, worktree, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.run_id,
    event.task_id || null,
    event.agent,
    event.event,
    event.model || null,
    event.input_refs ? JSON.stringify(event.input_refs) : null,
    event.worktree || null,
    event.summary || null,
  );
}

export function listByRunId(db: Database.Database, runId: string): AgentEvent[] {
  const rows = db.prepare(
    "SELECT * FROM agent_events WHERE run_id = ? ORDER BY timestamp ASC",
  ).all(runId) as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

export function listByTaskId(db: Database.Database, taskId: string): AgentEvent[] {
  const rows = db.prepare(
    "SELECT * FROM agent_events WHERE task_id = ? ORDER BY timestamp ASC",
  ).all(taskId) as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

export function listRecent(db: Database.Database, limit: number = 50): AgentEvent[] {
  const rows = db.prepare(
    "SELECT * FROM agent_events ORDER BY timestamp DESC LIMIT ?",
  ).all(limit) as Array<Record<string, unknown>>;
  return rows.map(mapRow).reverse();
}

function mapRow(row: Record<string, unknown>): AgentEvent {
  return {
    timestamp: row.timestamp as string,
    run_id: row.run_id as string,
    task_id: (row.task_id as string) || undefined,
    agent: row.agent as string,
    event: row.event as string,
    model: (row.model as string) || undefined,
    input_refs: parseJsonArray(row.input_refs as string | null),
    worktree: (row.worktree as string) || undefined,
    summary: (row.summary as string) || undefined,
  };
}

function parseJsonArray(val: string | null): string[] | undefined {
  if (!val) return undefined;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
