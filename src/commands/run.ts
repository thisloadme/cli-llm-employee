import chalk from "chalk";
import { getDb } from "../storage/db.js";
import * as tasksRepo from "../storage/repos/tasks.js";
import { configExists } from "../config/loader.js";
import { Orchestrator } from "../services/orchestrator.js";
import {
  renderMessage,
  renderTaskBanner,
  renderTaskComplete,
  renderSeparator,
} from "../ui/chat-renderer.js";
import type { Message } from "../schemas/message.js";

export interface RunOptions {
  next?: boolean;
  epic?: string;
  all?: boolean;
}

export interface RunCallbacks {
  onMessage?: (msg: Message) => void;
  onBanner?: (text: string) => void;
  onComplete?: (text: string) => void;
  onSeparator?: () => void;
  pollUserInput?: () => string | null;
}

export async function runTask(
  cwd: string,
  taskId: string | undefined,
  opts: RunOptions,
  callbacks?: RunCallbacks,
): Promise<void> {
  if (!configExists(cwd)) {
    console.log(chalk.red("No .digital-team/config.yaml found. Run /init first."));
    return;
  }

  const db = getDb(cwd);

  if (opts.epic) {
    const tasks = tasksRepo.listByEpic(db, opts.epic);
    const eligible = tasks.filter((t) => t.status === "ASSIGNED");
    if (eligible.length === 0) {
      console.log(chalk.yellow(`No ASSIGNED tasks in epic ${opts.epic}.`));
      return;
    }
    console.log(chalk.bold(`\nEpic ${opts.epic}: ${eligible.length} ready task(s)\n`));
    for (const t of eligible) {
      console.log(`  ${chalk.cyan(t.id)}  ${t.title}`);
    }
    console.log(chalk.gray("\nRun with: /run --all to process all, or /run TASK-XXX"));
    return;
  }

  if (opts.next && !taskId) {
    const eligible = tasksRepo.listEligible(db, "DONE");
    if (eligible.length === 0) {
      console.log(chalk.yellow("No eligible tasks (ASSIGNED status, dependencies done)."));
      console.log(chalk.gray("Run /start to generate tasks, then /plan to assign them."));
      return;
    }
    taskId = eligible[0].id;
  }

  if (taskId) {
    const row = tasksRepo.getById(db, taskId);
    if (!row) {
      console.log(chalk.red(`Task ${taskId} not found.`));
      return;
    }

    const task = tasksRepo.rowToTask(row);

    if (task.status !== "ASSIGNED") {
      console.log(chalk.yellow(`Task ${taskId} is ${task.status}, not ASSIGNED.`));
      return;
    }

    if (task.depends_on.length > 0) {
      for (const depId of task.depends_on) {
        const dep = tasksRepo.getById(db, depId);
        if (!dep || dep.status !== "DONE") {
          console.log(chalk.red(`Cannot run ${taskId}: dependency ${depId} is not DONE (${dep?.status || "not found"}).`));
          return;
        }
      }
    }
  }

  const orchestrator = new Orchestrator({
    cwd,
    taskId: taskId || undefined,
    all: opts.all,
    onMessage: callbacks?.onMessage || ((msg: Message) => console.log(renderMessage(msg))),
    onBanner: callbacks?.onBanner || ((text: string) => console.log(text)),
    onComplete: callbacks?.onComplete || ((text: string) => console.log(text)),
    onSeparator: callbacks?.onSeparator || (() => console.log(renderSeparator())),
    pollUserInput: callbacks?.pollUserInput || (() => null),
  });

  await orchestrator.run();
}
