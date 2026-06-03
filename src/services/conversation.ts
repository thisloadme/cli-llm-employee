import type { Message, MentionTarget } from "../schemas/message.js";

const MENTION_REGEX = /@(backend-worker|frontend-worker|docs-test-worker|reviewer|user)\b/g;

const COMPLETION_SIGNALS = [
  "task complete",
  "task is complete",
  "task done",
  "task is done",
  "all done",
  "approved and done",
  "approved. task",
  "approved and complete",
  "\u2705",
  "moving on to",
  "moving to next",
  "no further action",
];

export class Conversation {
  taskId: string;
  messages: Message[] = [];

  constructor(taskId: string) {
    this.taskId = taskId;
  }

  private push(role: Message["role"], agent: string, content: string): Message {
    const mentions = Conversation.parseMentions(content);
    const msg: Message = {
      role,
      agent,
      content,
      mentions,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(msg);
    return msg;
  }

  addSystem(content: string): Message {
    return this.push("system", "System", content);
  }

  addTeamLead(content: string): Message {
    return this.push("team_lead", "Team Lead", content);
  }

  addWorker(agentName: string, content: string): Message {
    const displayNames: Record<string, string> = {
      "backend-worker": "Backend Worker",
      "frontend-worker": "Frontend Worker",
      "docs-test-worker": "Docs & Test Worker",
    };
    return this.push("worker", displayNames[agentName] || agentName, content);
  }

  addReviewer(content: string): Message {
    return this.push("reviewer", "Reviewer", content);
  }

  addUser(content: string): Message {
    return this.push("user", "You", content);
  }

  lastMessage(): Message | undefined {
    return this.messages[this.messages.length - 1];
  }

  toOpenAI(): Array<{ role: "system" | "user" | "assistant"; content: string }> {
    return this.messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        if (m.role === "user") return { role: "user" as const, content: `[User]: ${m.content}` };
        return { role: "assistant" as const, content: `[${m.agent}]: ${m.content}` };
      });
  }

  toOpenAIWithSystem(systemPrompt: string): Array<{ role: "system" | "user" | "assistant"; content: string }> {
    return [{ role: "system", content: systemPrompt }, ...this.toOpenAI()];
  }

  static parseMentions(text: string): MentionTarget[] {
    const mentions: MentionTarget[] = [];
    let match;
    while ((match = MENTION_REGEX.exec(text)) !== null) {
      mentions.push(match[1] as MentionTarget);
    }
    MENTION_REGEX.lastIndex = 0;
    return mentions;
  }

  static hasCompletionSignal(text: string): boolean {
    const lower = text.toLowerCase();
    return COMPLETION_SIGNALS.some((signal) => lower.includes(signal));
  }
}
