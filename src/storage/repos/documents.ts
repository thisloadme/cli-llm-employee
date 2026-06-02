import type Database from "better-sqlite3";

export interface DocumentRow {
  id: number;
  source_path: string;
  processed_path: string | null;
  doc_type: string;
  title: string | null;
  word_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export function getBySourcePath(db: Database.Database, sourcePath: string): DocumentRow | undefined {
  return db.prepare("SELECT * FROM documents WHERE source_path = ?").get(sourcePath) as DocumentRow | undefined;
}

export function listByStatus(db: Database.Database, status: string): DocumentRow[] {
  return db.prepare("SELECT * FROM documents WHERE status = ? ORDER BY created_at DESC").all(status) as DocumentRow[];
}

export function listAll(db: Database.Database): DocumentRow[] {
  return db.prepare("SELECT * FROM documents ORDER BY created_at DESC").all() as DocumentRow[];
}

export function create(db: Database.Database, row: Omit<DocumentRow, "id" | "created_at" | "updated_at">): void {
  db.prepare(`
    INSERT INTO documents (source_path, processed_path, doc_type, title, word_count, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.source_path, row.processed_path, row.doc_type, row.title, row.word_count, row.status);
}

export function updateStatus(db: Database.Database, id: number, status: string): void {
  db.prepare("UPDATE documents SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}

export function updateProcessedPath(db: Database.Database, id: number, processedPath: string): void {
  db.prepare("UPDATE documents SET processed_path = ?, updated_at = datetime('now') WHERE id = ?").run(processedPath, id);
}
