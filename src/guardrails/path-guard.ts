import * as path from "node:path";

export function validatePath(worktreePath: string, targetPath: string, allowedPaths: string[]): { ok: boolean; error?: string } {
  const resolved = path.resolve(worktreePath, targetPath);

  if (!resolved.startsWith(worktreePath)) {
    return { ok: false, error: `Path traversal detected: ${targetPath}` };
  }

  if (allowedPaths.length === 0) return { ok: true };

  const relative = path.relative(worktreePath, resolved);
  const isAllowed = allowedPaths.some((allowed) => relative.startsWith(allowed.replace(/^\/+/, "")));

  if (!isAllowed) {
    return {
      ok: false,
      error: `Path ${targetPath} is outside allowed scope: [${allowedPaths.join(", ")}]`,
    };
  }

  return { ok: true };
}
