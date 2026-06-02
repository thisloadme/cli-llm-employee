# dteam — Digital Team CLI

Multi-agent LLM orchestration as a CLI tool. Drop a PRD in `docs/inbox/`, run `/start`, and watch your virtual team plan and execute tasks through specialist agents — Team Lead, Backend Worker, Frontend Worker, Docs/Test Worker, and Reviewer.

## Install

```bash
npm install -g .
```

Or from a local clone:

```bash
git clone <repo-url> && cd cli-llm-employee
npm install
npm run build
npm install -g .
```

## Quick Start

```bash
# 1. Initialize a project
dteam init
# or: dteam → enters REPL → /init

# 2. Configure workers and API keys
dteam config
# Interactive: set base URL, API key, model per agent role
# Supports OpenAI, OpenRouter, Ollama, or any OpenAI-compatible endpoint

# 3. Drop a PRD into docs/inbox/
echo "# Checkout MVP\n\n## Requirements\n- Users add items to cart\n- Payment processing\n- Order confirmation" > docs/inbox/checkout-mvp.md

# 4. Start the pipeline
dteam start
# Scan → Ingest → Team Lead Plan → Task Backlog generated

# 5. See the dashboard
dteam status

# 6. Run eligible tasks
dteam run --next

# 7. Review completed work
dteam review TASK-001
```

## Commands

### Traditional CLI (scripting / CI)

```bash
dteam init                        # Create .digital-team/ structure
dteam config                      # Interactive worker configuration
dteam start                       # Scan + ingest + plan pipeline
dteam start --skip-scan           # Skip scanning, start from ingest
dteam scan                        # Scan docs/inbox/ for new files
dteam ingest                      # Process and categorize documents
dteam plan                        # Team Lead generates task backlog
dteam tasks list                  # List all tasks
dteam tasks show TASK-001         # Show task detail
dteam run TASK-001                # Execute specific task
dteam run --next                  # Run next eligible task
dteam run --epic EPIC-001         # Show ready tasks in an epic
dteam review TASK-001             # Run reviewer on completed task
dteam status                      # Project dashboard
dteam logs                        # Recent event log
dteam logs --run latest           # Latest run timeline
dteam logs --task TASK-001        # Events for specific task
dteam tui                         # Terminal dashboard
```

### REPL Mode (interactive)

Just run `dteam` without arguments to enter the REPL:

```
╔══════════════════════════════════════╗
║   Digital Team CLI v0.1.0           ║
║   Type /help for commands           ║
╚══════════════════════════════════════╝
dteam> /init
dteam> /config
dteam> /start
dteam> /status
dteam> /tasks list
dteam> /task show TASK-001
dteam> /run --next
dteam> /review TASK-001
dteam> /logs --run latest
dteam> /tui
dteam> /exit
```

## Agent Roles

| Agent | Responsibilities |
|---|---|
| **Team Lead** | Reads source docs, breaks work into tasks, assigns to specialists, defines acceptance criteria |
| **Backend Worker** | APIs, services, database schema, migrations, business logic |
| **Frontend Worker** | UI components, pages, state management, user interactions |
| **Docs/Test Worker** | Test plans, unit/integration tests, documentation, changelogs |
| **Reviewer** | Evaluates work against acceptance criteria, diff, and test results |

## Provider Support

Any OpenAI-compatible endpoint works:

```yaml
# .digital-team/config.yaml
team_lead:
  base_url: https://api.openai.com/v1      # OpenAI
  api_key: sk-...
  model: gpt-4o

workers:
  backend:
    base_url: https://openrouter.ai/api/v1  # OpenRouter
    api_key: sk-or-...
    model: anthropic/claude-sonnet

  frontend:
    base_url: http://localhost:11434/v1     # Ollama (local)
    api_key: ollama
    model: codellama
```

## Project Structure (after `/init`)

```
project-root/
├── .digital-team/           # Agent configs, policies, prompts, schemas, memory
│   ├── config.yaml          # Worker & model configuration
│   ├── state.db             # SQLite state store
│   ├── agents/              # Agent identity definitions
│   ├── policies/            # Coding, review, security rules
│   ├── prompts/             # Planning, execution, review prompts
│   ├── schemas/             # JSON schemas for backlog, task, review
│   └── memory/              # Glossary, ADR, product context
├── docs/
│   ├── inbox/               # Drop PRDs here
│   ├── processed/           # Auto-categorized docs
│   ├── prd/                 # Product requirement documents
│   ├── adr/                 # Architecture decision records
│   └── specs/               # Technical specifications
├── backlog/
│   ├── backlog.yaml         # Generated epic + task list
│   └── tasks/               # Individual TASK-XXX.yaml files
├── runs/                    # Execution history with agent events
│   └── latest → symlink     # Points to latest run
├── worktrees/               # Isolated task workspaces
└── output/                  # Generated artifacts
```

## Task Lifecycle

```
INGESTED → PLANNED → ASSIGNED → IN_PROGRESS → REVIEW_PENDING
                                                  │
                                    ┌─────────────┼─────────────┐
                                    ▼             ▼             ▼
                               APPROVED    CHANGES_REQUESTED  BLOCKED
                                    │             │
                                    ▼             ▼
                                  DONE         ASSIGNED (retry)
```

### State Rules
- Task cannot enter `IN_PROGRESS` if dependencies aren't `DONE`
- Task cannot be `DONE` without reviewer `APPROVED`
- Worker works in isolated `worktrees/TASK-XXX/` — no cross-contamination
- One task = one worktree = one diff story

## Configuration Reference

### config.yaml

```yaml
project_name: my-project
main_branch: main
max_parallel_tasks: 2       # Max concurrent worker executions
default_retry_limit: 2      # Max review retries before blocking
review_required: true       # Require reviewer approval
allow_direct_merge: false   # Never auto-merge to main

context:
  include_paths: [src, tests, docs]
  exclude_paths: [node_modules, dist, vendor]

workers:
  backend:
    enabled: true
    base_url: https://api.openai.com/v1
    api_key: sk-...
    model: gpt-4o
  frontend:
    enabled: true
    base_url: https://api.openai.com/v1
    api_key: sk-...
    model: gpt-4o
  docs-test:
    enabled: true
    base_url: https://api.openai.com/v1
    api_key: sk-...
    model: gpt-4o-mini

team_lead:
  base_url: https://api.openai.com/v1
  api_key: sk-...
  model: gpt-4o

reviewer:
  base_url: https://api.openai.com/v1
  api_key: sk-...
  model: gpt-4o
```

## Security Guardrails

- Path allowlist — worker cannot write outside task scope
- Forbidden command patterns — blocks `rm -rf`, `sudo`, `chmod 777`, etc.
- Scope validator — diff is checked against task's `in`/`out` paths
- No auto-merge — `allow_direct_merge: false` by default
- All agent events logged with timestamps for audit trail

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js ≥ 18, TypeScript |
| CLI | Commander.js + Node readline (REPL) |
| Schema | Zod |
| Storage | SQLite (better-sqlite3) |
| Config | YAML (js-yaml) |
| LLM | OpenAI SDK with custom baseURL routing |
| Git | simple-git (worktree isolation) |

## License

MIT
