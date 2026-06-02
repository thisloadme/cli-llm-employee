import type Database from "better-sqlite3";
import type { Task } from "../../schemas/backlog.js";

export interface TaskRow {
  id: string;
  epic_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_agent: string | null;
  depends_on: string | null;
  source_docs: string | null;
  acceptance_criteria: string | null;
  scope_in: string | null;
  scope_out: string | null;
  execution_branch: string | null;
  execution_worktree: string | null;
  execution_retry_count: number;
  review_required: number;
  created_at: string;
  updated_at: string;
}

export function create(db: Database.Database, task: Task, epicId?: string): void {
  db.prepare(`
    INSERT INTO tasks (id, epic_id, title, description, status, priority, assigned_agent,
      depends_on, source_docs, acceptance_criteria, scope_in, scope_out,
      execution_branch, execution_worktree, execution_retry_count, review_required)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    epicId || null,
    task.title,
    task.description || null,
    task.status,
    task.priority,
    task.assigned_agent,
    JSON.stringify(task.depends_on),
    JSON.stringify(task.source_docs),
    JSON.stringify(task.acceptance_criteria),
    JSON.stringify(task.scope.in),
    JSON.stringify(task.scope.out),
    task.execution?.branch || null,
    task.execution?.worktree || null,
    task.execution?.retry_count || 0,
    (task.review?.required ?? true) ? 1 : 0,
  );
}

export function getById(db: Database.Database, id: string): TaskRow | undefined {
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
}

export function listByStatus(db: Database.Database, status: string): TaskRow[] {
  return db.prepare("SELECT * FROM tasks WHERE status = ? ORDER BY priority DESC, created_at ASC").all(status) as TaskRow[];
}

export function listByEpic(db: Database.Database, epicId: string): TaskRow[] {
  return db.prepare("SELECT * FROM tasks WHERE epic_id = ? ORDER BY created_at ASC").all(epicId) as TaskRow[];
}

export function listAll(db: Database.Database): TaskRow[] {
  return db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all() as TaskRow[];
}

export function listEligible(db: Database.Database, doneStatus: string): TaskRow[] {
  return db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'ASSIGNED'
    AND execution_retry_count < 3
    ORDER BY priority DESC, created_at ASC
  `).all() as TaskRow[];
}

export function updateStatus(db: Database.Database, id: string, status: string): void {
  db.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}

export function incrementRetry(db: Database.Database, id: string): void {
  db.prepare("UPDATE tasks SET execution_retry_count = execution_retry_count + 1, updated_at = datetime('now') WHERE id = ?").run(id);
}

export function updateExecution(db: Database.Database, id: string, branch: string, worktree: string): void {
  db.prepare(`
    UPDATE tasks SET execution_branch = ?, execution_worktree = ?, status = 'IN_PROGRESS', updated_at = datetime('now')
    WHERE id = ?
  `).run(branch, worktree, id);
}

export function countByStatus(db: Database.Database): Record<string, number> {
  const rows = db.prepare("SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status").all() as Array<{ status: string; cnt: number }>;
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = row.cnt;
  }
  return counts;
}

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    assigned_agent: (row.assigned_agent || "backend-worker") as Task["assigned_agent"],
    depends_on: safeParse(row.depends_on, []),
    source_docs: safeParse(row.source_docs, []),
    acceptance_criteria: safeParse(row.acceptance_criteria, []),
    scope: {
      in: safeParse(row.scope_in, []),
      out: safeParse(row.scope_out, []),
    },
    execution: {
      branch: row.execution_branch || "",
      worktree: row.execution_worktree || "",
      retry_count: row.execution_retry_count,
    },
    review: {
      required: row.review_required === 1,
      reviewer: "reviewer",
    },
  };
}

function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
