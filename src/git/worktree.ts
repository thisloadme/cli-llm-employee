import * as fs from "node:fs";
import * as path from "node:path";
import { ensureDir } from "../utils/format.js";

export async function createWorktree(
  cwd: string,
  taskId: string,
  branch: string,
): Promise<string> {
  const worktreePath = path.join(cwd, "worktrees", taskId);
  ensureDir(worktreePath);

  // In production, this would use simple-git to run:
  // git worktree add <worktreePath> -b <branch>
  // For now, we create the directory structure as placeholder

  const readmePath = path.join(worktreePath, "README.md");
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(
      readmePath,
      `# Worktree for ${taskId}\n\nBranch: ${branch}\nCreated: ${new Date().toISOString()}\n`,
    );
  }

  return worktreePath;
}

export async function cleanupWorktree(
  cwd: string,
  taskId: string,
): Promise<void> {
  // In production: git worktree remove worktrees/<taskId>
  // For now: no-op, keep worktrees for inspection
}

export async function getDiffSummary(worktreePath: string): Promise<{
  files_changed: number;
  insertions: number;
  deletions: number;
  files: Array<{ path: string; status: "added" | "modified" | "deleted" }>;
}> {
  const files: Array<{ path: string; status: "added" | "modified" | "deleted" }> = [];

  function scanDir(dir: string, base: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "README.md") continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(base, fullPath);
      if (entry.isDirectory()) {
        scanDir(fullPath, base);
      } else {
        files.push({ path: relPath, status: "added" });
      }
    }
  }

  scanDir(worktreePath, worktreePath);

  return {
    files_changed: files.length,
    insertions: 0, // Would come from git diff --stat
    deletions: 0,
    files,
  };
}
