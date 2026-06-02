import type Database from "better-sqlite3";
import type { Review } from "../../schemas/backlog.js";

export interface ReviewRow {
  id: number;
  task_id: string;
  verdict: string;
  score: number;
  checks_json: string | null;
  comments: string | null;
  created_at: string;
}

export function create(db: Database.Database, review: Review): void {
  db.prepare(`
    INSERT INTO reviews (task_id, verdict, score, checks_json, comments)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    review.task_id,
    review.verdict,
    review.score,
    JSON.stringify(review.checks),
    JSON.stringify(review.comments),
  );
}

export function getByTaskId(db: Database.Database, taskId: string): ReviewRow | undefined {
  return db.prepare(
    "SELECT * FROM reviews WHERE task_id = ? ORDER BY created_at DESC LIMIT 1",
  ).get(taskId) as ReviewRow | undefined;
}
