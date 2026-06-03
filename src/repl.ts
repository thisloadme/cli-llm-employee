import * as readline from "node:readline";
import type { Command } from "commander";

type SlashHandler = (args: string[], cwd: string) => Promise<void>;

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
    await runTask(cwd, taskId, {
      next: args.includes("--next"),
      epic: extractFlag(args, "--epic"),
    });
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

export function startRepl(_program: Command) {
  console.log(`╔══════════════════════════════════════╗
║   Digital Team CLI v0.1.0           ║
║   Type /help for commands           ║
╚══════════════════════════════════════╝`);

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "dteam> ",
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl!.prompt();
      return;
    }

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const handler = commands[cmd];
    if (handler) {
      rl!.pause();
      try {
        await handler(args, process.cwd());
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      rl!.resume();
    } else {
      console.log(`Unknown command: ${cmd}. Type /help for available commands.`);
    }
    rl!.prompt();
  });

  rl.on("close", () => {
    console.log("\nGoodbye!");
    process.exit(0);
  });
}
