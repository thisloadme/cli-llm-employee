import * as fs from "node:fs";
import * as path from "node:path";

export interface ScannedFile {
  name: string;
  path: string;
  mtime: Date;
  size: number;
}

const ALLOWED_EXTENSIONS = [".md", ".txt", ".yaml", ".yml", ".json"];

export class Scanner {
  constructor(private cwd: string) {}

  scan(): ScannedFile[] {
    const inboxDir = path.join(this.cwd, "docs", "inbox");
    if (!fs.existsSync(inboxDir)) {
      return [];
    }

    const entries = fs.readdirSync(inboxDir, { withFileTypes: true });
    const files: ScannedFile[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) continue;

      const fullPath = path.join(inboxDir, entry.name);
      const stat = fs.statSync(fullPath);

      files.push({
        name: entry.name,
        path: fullPath,
        mtime: stat.mtime,
        size: stat.size,
      });
    }

    return files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  }
}
