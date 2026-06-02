const FORBIDDEN_PATTERNS = [
  /rm\s+-rf/,
  /sudo\s/,
  /chmod\s+777/,
  /:\(\)\s*\{/,
  /mkfs\./,
  />\s*\/dev\//,
];

export function validateCommand(command: string): { ok: boolean; error?: string } {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(command)) {
      return { ok: false, error: `Forbidden command pattern detected: ${pattern}` };
    }
  }
  return { ok: true };
}
