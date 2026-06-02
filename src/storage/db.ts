import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";

let db: Database.Database | null = null;

export function getDb(cwd: string): Database.Database {
  if (db) return db;

  const dbDir = path.join(cwd, ".digital-team");
  if (!fs.existsSync(dbDir)) {
    throw new Error(
      "No .digital-team/ directory found. Run /init first.",
    );
  }

  const dbPath = path.join(dbDir, "state.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrate(db);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT NOT NULL UNIQUE,
      processed_path TEXT,
      doc_type TEXT DEFAULT 'notes',
      title TEXT,
      word_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ingested',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS epics (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_docs TEXT,
      status TEXT DEFAULT 'planned',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      epic_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'PLANNED',
      priority TEXT DEFAULT 'medium',
      assigned_agent TEXT,
      depends_on TEXT,
      source_docs TEXT,
      acceptance_criteria TEXT,
      scope_in TEXT,
      scope_out TEXT,
      execution_branch TEXT,
      execution_worktree TEXT,
      execution_retry_count INTEGER DEFAULT 0,
      review_required INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (epic_id) REFERENCES epics(id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      verdict TEXT NOT NULL,
      score REAL NOT NULL,
      checks_json TEXT,
      comments TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS agent_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      run_id TEXT NOT NULL,
      task_id TEXT,
      agent TEXT NOT NULL,
      event TEXT NOT NULL,
      model TEXT,
      input_refs TEXT,
      worktree TEXT,
      summary TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_epic ON tasks(epic_id);
    CREATE INDEX IF NOT EXISTS idx_events_run ON agent_events(run_id);
    CREATE INDEX IF NOT EXISTS idx_events_task ON agent_events(task_id);
  `);
}
