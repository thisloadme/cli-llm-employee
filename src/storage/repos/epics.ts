import type Database from "better-sqlite3";

export interface EpicRow {
  id: string;
  title: string;
  source_docs: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function create(db: Database.Database, row: Pick<EpicRow, "id" | "title" | "source_docs" | "status">): void {
  db.prepare("INSERT INTO epics (id, title, source_docs, status) VALUES (?, ?, ?, ?)").run(
    row.id, row.title, row.source_docs, row.status,
  );
}

export function getById(db: Database.Database, id: string): EpicRow | undefined {
  return db.prepare("SELECT * FROM epics WHERE id = ?").get(id) as EpicRow | undefined;
}

export function listAll(db: Database.Database): EpicRow[] {
  return db.prepare("SELECT * FROM epics ORDER BY created_at DESC").all() as EpicRow[];
}

export function updateStatus(db: Database.Database, id: string, status: string): void {
  db.prepare("UPDATE epics SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}

export function updateTaskList(db: Database.Database, id: string, tasks: string[]): void {
  db.prepare("UPDATE epics SET source_docs = ?, updated_at = datetime('now') WHERE id = ?").run(
    JSON.stringify(tasks), id,
  );
}
