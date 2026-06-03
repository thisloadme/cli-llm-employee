import { z } from "zod";

export const MentionTarget = z.enum([
  "backend-worker",
  "frontend-worker",
  "docs-test-worker",
  "reviewer",
  "user",
]);

export const MessageRole = z.enum([
  "system",
  "team_lead",
  "worker",
  "reviewer",
  "user",
]);

export const MessageSchema = z.object({
  role: MessageRole,
  agent: z.string(),
  content: z.string(),
  mentions: z.array(MentionTarget).default([]),
  timestamp: z.string(),
});

export type Message = z.infer<typeof MessageSchema>;
export type MentionTarget = z.infer<typeof MentionTarget>;
