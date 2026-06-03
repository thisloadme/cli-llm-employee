import * as readline from "node:readline";
import type { Command } from "commander";
import chalk from "chalk";
import { renderMessage, renderTaskBanner, renderTaskComplete, renderSeparator } from "./ui/chat-renderer.js";
import type { Message } from "./schemas/message.js";

type SlashHandler = (args: string[], cwd: string) => Promise<void>;

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function printHelp() {
  console.log(`
  Available slash commands:

    /init               Create .digital-team/ structure
    /config             Configure workers, models, API keys
    /scan               Scan docs/inbox/ for new files
    /ingest             Process and categorize documents
    /plan               Run Team Lead to generate backlog
    /tasks list         List all tasks
    /task show <id>     Show task detail
    /run <id>           Execute a specific task
    /run --next         Execute next eligible task
    /run --all          Execute all eligible tasks sequentially
    /review <id>        Run reviewer on task
    /status             Show project status dashboard
    /logs               Show run logs
    /logs --run latest  Show latest run logs
    /logs --task <id>   Show logs for specific task
    /tui                Launch interactive TUI dashboard
    /help               Show this help
    /exit               Exit Virtual Team

  You can also run: dteam <command> [options]
`);
}

let rl: readline.Interface | null = null;

function createReplReadline(): readline.Interface {
  const newRl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "dteam> ",
  });

  newRl.on("line", async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      newRl.prompt();
      return;
    }

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const handler = commands[cmd];
    if (handler) {
      newRl.pause();
      try {
        await handler(args, process.cwd());
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      newRl.resume();
    } else {
      console.log(`Unknown command: ${cmd}. Type /help for available commands.`);
    }
    newRl.prompt();
  });

  newRl.on("close", () => {
    console.log("\nGoodbye!");
    process.exit(0);
  });

  return newRl;
}

const commands: Record<string, SlashHandler> = {
  "/init": async (_, cwd) => {
    const { initProject } = await import("./commands/init.js");
    await initProject(cwd);
  },
  "/config": async (_, cwd) => {
    const { configure } = await import("./commands/config.js");
    await configure(cwd);
  },
  "/start": async (args, cwd) => {
    const { startPipeline } = await import("./commands/start.js");
    await startPipeline(cwd, {
      skipScan: args.includes("--skip-scan"),
      skipIngest: args.includes("--skip-ingest"),
    });
  },
  "/scan": async (_, cwd) => {
    const { scanInbox } = await import("./commands/scan.js");
    await scanInbox(cwd);
  },
  "/ingest": async (_, cwd) => {
    const { ingestDocs } = await import("./commands/ingest.js");
    await ingestDocs(cwd);
  },
  "/plan": async (_, cwd) => {
    const { runPlanning } = await import("./commands/plan.js");
    await runPlanning(cwd);
  },
  "/tasks": async (args, cwd) => {
    const { handleTasks } = await import("./commands/tasks.js");
    const [action, id] = args;
    await handleTasks(cwd, action || "list", id);
  },
  "/task": async (args, cwd) => {
    const { handleTasks } = await import("./commands/tasks.js");
    const [action, id] = args;
    await handleTasks(cwd, action || "show", id || args[0]);
  },
  "/run": async (args, cwd) => {
    const { runTask } = await import("./commands/run.js");

    const taskId = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
    const opts = {
      next: args.includes("--next"),
      epic: extractFlag(args, "--epic"),
      all: args.includes("--all"),
    };

    if (!opts.next && !opts.all && !taskId && !opts.epic) {
      console.log(chalk.yellow("Usage: /run <task-id> | --next | --all | --epic <id>"));
      return;
    }

    // Enter chat mode: pause REPL, switch to raw stdin
    rl!.pause();
    rl!.close();

    process.stdin.setRawMode(true);
    process.stdin.resume();

    const inputQueue: string[] = [];
    let lineBuffer = "";

    const onData = (data: Buffer): void => {
      const chars = data.toString();
      for (const char of chars) {
        if (char === "\x03") {
          inputQueue.push("/stop");
          lineBuffer = "";
          process.stdout.write("^C\n");
        } else if (char === "\r" || char === "\n") {
          if (lineBuffer.trim()) {
            inputQueue.push(lineBuffer.trim());
          }
          lineBuffer = "";
          process.stdout.write("\n");
        } else if (char === "\x7f" || char === "\b") {
          if (lineBuffer.length > 0) {
            lineBuffer = lineBuffer.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else {
          lineBuffer += char;
          process.stdout.write(char);
        }
      }
    };

    process.stdin.on("data", onData);

    try {
      await runTask(cwd, taskId, opts, {
        onMessage: (msg: Message) => console.log(renderMessage(msg)),
        onBanner: (text: string) => console.log(text),
        onComplete: (text: string) => console.log(text),
        onSeparator: () => console.log(renderSeparator()),
        pollUserInput: () => {
          if (inputQueue.length > 0) return inputQueue.shift()!;
          return null;
        },
      });
    } finally {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();

      // Recreate REPL
      rl = createReplReadline();
      rl.prompt();
    }
  },
  "/review": async (args, cwd) => {
    const { reviewTaskCmd } = await import("./commands/review.js");
    await reviewTaskCmd(cwd, args[0]);
  },
  "/status": async (_, cwd) => {
    const { showStatus } = await import("./commands/status.js");
    await showStatus(cwd);
  },
  "/logs": async (args, cwd) => {
    const { showLogs } = await import("./commands/logs.js");
    await showLogs(cwd, {
      run: extractFlag(args, "--run"),
      task: extractFlag(args, "--task"),
    });
  },
  "/tui": async (_, cwd) => {
    const { launchTui } = await import("./tui/app.js");
    await launchTui(cwd);
  },
  "/help": async () => {
    printHelp();
  },
  "/exit": async () => {
    process.exit(0);
  },
};

export function startRepl(_program: Command) {
  console.log(`╔══════════════════════════════════════╗
║   Digital Team CLI v0.1.0           ║
║   Type /help for commands           ║
╚══════════════════════════════════════╝`);

  rl = createReplReadline();
  rl.prompt();
}
