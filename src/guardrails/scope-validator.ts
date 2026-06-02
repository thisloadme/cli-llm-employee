export interface DiffSummary {
  files_changed: number;
  insertions: number;
  deletions: number;
  files: Array<{ path: string; status: "added" | "modified" | "deleted" }>;
}

export function validateScope(
  diff: DiffSummary,
  allowedIn: string[],
  allowedOut: string[],
): { ok: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const file of diff.files) {
    if (allowedOut.some((pattern) => file.path.startsWith(pattern))) {
      violations.push(`File ${file.path} is in the explicit OUT scope`);
    }
    if (allowedIn.length > 0 && !allowedIn.some((pattern) => file.path.startsWith(pattern))) {
      violations.push(`File ${file.path} is outside the IN scope: [${allowedIn.join(", ")}]`);
    }
  }

  return { ok: violations.length === 0, violations };
}
