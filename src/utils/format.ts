import * as fs from "node:fs";
import * as path from "node:path";

export function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function generateTaskId(epicNum: number, taskNum: number): string {
  return `TASK-${String(taskNum).padStart(3, "0")}`;
}

export function generateEpicId(num: number): string {
  return `EPIC-${String(num).padStart(3, "0")}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
