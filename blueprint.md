# Blueprint Lengkap: CLI Multi-Agent LLM sebagai Tim Digital

Dokumen ini mendefinisikan blueprint konkret untuk membangun aplikasi berbasis CLI yang menjalankan beberapa LLM sebagai tim digital. Target sistem adalah menerima PRD atau dokumen proyek dari folder repo, mengubahnya menjadi backlog yang dapat dieksekusi, membagi pekerjaan ke agent spesialis, melakukan review otomatis, dan menjaga seluruh proses tetap audit-able, repeatable, dan nyaman digunakan dalam antarmuka CLI.

## 1. Tujuan Sistem

Sistem ini bukan chatbot multi-agent yang saling berbicara tanpa kontrol. Sistem ini adalah **orchestrated digital team**: satu Team Lead Agent memecah scope kerja, beberapa Worker Agent mengerjakan task yang spesifik, lalu Reviewer Agent memeriksa hasil sebelum task dianggap selesai.

Tujuan utamanya:

- Programmer hanya perlu menaruh dokumen seperti PRD, ADR, API spec, wireframe notes, atau issue list ke folder proyek.
- Team Lead Agent membaca konteks proyek dan memecah dokumen menjadi task kecil yang punya acceptance criteria.
- Task di-assign ke agent tertentu berdasarkan spesialisasi.
- Hasil kerja tiap agent dievaluasi oleh reviewer, bukan langsung dianggap benar.
- Semua keputusan, artifact, dan perubahan file tercatat jelas di CLI log dan struktur repo.
- UI tetap CLI-first tetapi terlihat rapi, informatif, dan operasional.

## 2. Prinsip Arsitektur

### 2.1 Jangan membangun agent democracy

Pendekatan terbaik adalah arsitektur hirarkis, bukan semua agent bebas berbicara dan mengambil keputusan sendiri. Pola supervisor dan handoff seperti ini memang didukung secara eksplisit oleh LangGraph melalui `create_supervisor()` dan `create_handoff_tool()` untuk delegasi antar-agent yang terstruktur [cite:17][cite:14].

OpenAI Agents SDK juga mendukung konsep handoff sebagai mekanisme delegasi antar-agent, sehingga ide supervisor -> specialist workers -> review gate adalah pola yang memang masuk akal secara framework, bukan sekadar improvisasi desain [cite:15][cite:18].

### 2.2 Gunakan otonomi terbatas

Jangan izinkan agent melakukan merge langsung ke branch utama, mengubah scope seenaknya, atau menjalankan tool tanpa pembatasan. Sistem yang terlihat “paling otonom” biasanya paling susah diaudit ketika mulai salah.

### 2.3 Semua state harus eksplisit

State utama seperti `INGESTED`, `PLANNED`, `ASSIGNED`, `IN_PROGRESS`, `REVIEW_PENDING`, `CHANGES_REQUESTED`, `DONE`, dan `BLOCKED` harus disimpan sebagai data nyata. Jangan menyimpan state hanya di percakapan model.

### 2.4 Repo adalah kontrak kerja

Folder project bukan sekadar tempat file sumber. Repo harus menjadi sumber kebenaran untuk dokumen, backlog, task, artifact, review note, policy, dan hasil eksekusi.

## 3. Pilihan Teknologi yang Disarankan

### 3.1 Rekomendasi inti

**Gunakan Python untuk orchestrator utama.** Alasan praktisnya: ekosistem agent framework lebih matang di Python, integrasi parsing dokumen dan state machine lebih cepat dibangun, dan TUI/CLI tooling juga cukup mapan.

**Gunakan LangGraph sebagai orchestrator.** Alasannya bukan hype, tapi karena kebutuhan sistem ini sangat cocok dengan model supervisor graph dan handoff yang memang menjadi primitive resmi LangGraph untuk sistem multi-agent [cite:17][cite:14].

**Gunakan provider abstraction untuk model backend.** Team Lead dan Reviewer bisa memakai model yang lebih kuat, sedangkan Worker bisa memakai model yang lebih murah atau lebih cepat. OpenAI Agents SDK menekankan primitives seperti agents, handoffs, guardrails, sessions, dan tracing; konsep-konsep ini tetap layak diadopsi walau orchestrator utama memakai LangGraph [cite:18].

### 3.2 Stack yang direkomendasikan

| Layer | Pilihan | Alasan |
|---|---|---|
| Orchestrator | Python + LangGraph | Cocok untuk supervisor, handoff, dan stateful workflow [cite:17][cite:14] |
| CLI/TUI | Python + Typer + Rich/Textual | Cepat untuk command ergonomis dan tampilan terminal yang bagus |
| Model Router | LiteLLM atau adapter custom | Memudahkan ganti provider/model |
| Document Parsing | Markdown/YAML parser, optional PDF parser | PRD biasanya berbentuk md, txt, doc export |
| State Store | SQLite dulu, PostgreSQL nanti | MVP cepat, production-ready upgrade path jelas |
| Queue/Execution | asyncio + worker pool | Cukup untuk awal sebelum perlu message broker |
| Git isolation | git worktree | Isolasi per task agar agent tidak saling tabrak |
| Observability | structured logs + traces + run history | Penting untuk audit dan debugging |

### 3.3 Model role strategy

| Role | Karakter model |
|---|---|
| Team Lead | reasoning kuat, context window besar |
| Backend Worker | code-oriented, kuat di refactor dan API |
| Frontend Worker | kuat di UI, state, component composition |
| Docs/Test Worker | kuat di test generation, docs, acceptance criteria |
| Reviewer | model paling teliti dan konsisten |

## 4. Arsitektur Sistem

### 4.1 Komponen utama

Sistem dibagi menjadi beberapa komponen:

1. **CLI App**
   - Entry point seluruh operasi.
   - Menangani command seperti init, ingest, plan, run, review, status, logs.
   - Menampilkan dashboard TUI dan progress.

2. **Project Scanner**
   - Mendeteksi file baru di folder `docs/inbox/`.
   - Mengindeks PRD, spec, dan rule proyek.

3. **Context Builder**
   - Menggabungkan project metadata, struktur repo, file rules, decisions, dan dokumen sumber.
   - Menyusun context pack yang ringkas untuk agent tertentu.

4. **Team Lead Agent**
   - Membaca dokumen.
   - Menghasilkan epic, tasks, dependency map, dan acceptance criteria.
   - Melakukan assignment ke specialist agent.

5. **Worker Agents**
   - Mengerjakan task yang ditugaskan.
   - Boleh mengubah file hanya dalam worktree task mereka.
   - Menghasilkan artifact, patch summary, dan self-check.

6. **Reviewer Agent**
   - Membaca task brief, diff, test result, dan acceptance criteria.
   - Memberi verdict: approve, request changes, blocked.

7. **Execution Engine**
   - Menjalankan loop task-by-task atau parallel execution terbatas.
   - Menjaga timeout, retry, token budget, dan concurrency policy.

8. **State Store**
   - Menyimpan task state, assignment, retry count, run history, dan review result.

9. **Artifact Store**
   - Menyimpan backlog json/yaml, task files, logs, summaries, dan review reports.

10. **Git Manager**
    - Membuat branch/worktree per task.
    - Menjalankan diff, commit draft, dan cleanup.

### 4.2 Diagram logis

```text
User drops PRD -> Inbox Scanner -> Context Builder -> Team Lead
                                              |
                                              v
                                      Task Backlog + Assignment
                                              |
                       +----------------------+----------------------+
                       |                                             |
                       v                                             v
               Worker Agent A                                 Worker Agent B
                       |                                             |
                       +----------------------+----------------------+
                                              |
                                              v
                                         Reviewer Agent
                                              |
                         +--------------------+--------------------+
                         |                                         |
                         v                                         v
                      Approved                              Changes Requested
                         |                                         |
                         v                                         v
                    Commit/PR Draft                         Back to assigned worker
```

## 5. Struktur Folder Repo

Gunakan struktur seperti ini sejak awal:

```text
project-root/
├── .digital-team/
│   ├── config.yaml
│   ├── models.yaml
│   ├── agents/
│   │   ├── team-lead.md
│   │   ├── backend-worker.md
│   │   ├── frontend-worker.md
│   │   ├── docs-test-worker.md
│   │   └── reviewer.md
│   ├── policies/
│   │   ├── coding-rules.md
│   │   ├── review-rules.md
│   │   ├── security-rules.md
│   │   └── done-criteria.md
│   ├── prompts/
│   │   ├── planning.md
│   │   ├── execution.md
│   │   ├── review.md
│   │   └── repair.md
│   ├── schemas/
│   │   ├── backlog.schema.json
│   │   ├── task.schema.json
│   │   └── review.schema.json
│   └── memory/
│       ├── glossary.md
│       ├── architecture-decisions.md
│       └── product-context.md
├── docs/
│   ├── inbox/
│   ├── processed/
│   ├── prd/
│   ├── adr/
│   └── specs/
├── backlog/
│   ├── backlog.yaml
│   └── tasks/
│       ├── TASK-001.yaml
│       ├── TASK-002.yaml
│       └── TASK-003.yaml
├── runs/
│   ├── 2026-06-02-run-001/
│   │   ├── run.json
│   │   ├── timeline.log
│   │   ├── agent-events.ndjson
│   │   ├── artifacts/
│   │   └── reviews/
│   └── latest -> symbolic link
├── worktrees/
│   ├── TASK-001/
│   └── TASK-002/
├── output/
├── src/
└── tests/
```

### Kenapa struktur ini penting

- `docs/inbox/` adalah titik masuk kerja.
- `backlog/tasks/` membuat planning menjadi objek nyata, bukan cuma chat transcript.
- `runs/` menyimpan histori eksekusi untuk audit.
- `worktrees/` memisahkan perubahan per task.
- `.digital-team/` memaksa aturan dan identitas agent menjadi versioned configuration.

## 6. Data Contract Inti

### 6.1 `config.yaml`

```yaml
project_name: my-project
main_branch: main
max_parallel_tasks: 2
default_retry_limit: 2
review_required: true
allow_direct_merge: false
context:
  include_paths:
    - src
    - tests
    - docs
  exclude_paths:
    - node_modules
    - dist
    - vendor
models:
  team_lead: openai/gpt-5.4
  backend_worker: openrouter/qwen-coder
  frontend_worker: anthropic/claude-sonnet
  docs_test_worker: openai/gpt-5.4-mini
  reviewer: openai/gpt-5.4
```

### 6.2 `backlog.yaml`

```yaml
epic_id: EPIC-001
title: Checkout MVP
source_docs:
  - docs/prd/checkout-mvp.md
status: planned
tasks:
  - TASK-001
  - TASK-002
  - TASK-003
```

### 6.3 `TASK-001.yaml`

```yaml
id: TASK-001
title: Create payment service contract
status: ASSIGNED
priority: high
assigned_agent: backend-worker
depends_on: []
source_docs:
  - docs/prd/checkout-mvp.md
scope:
  in:
    - src/services/payment
    - src/contracts
  out:
    - frontend checkout UI
acceptance_criteria:
  - API contract documented
  - Unit test added
  - No breaking changes to existing checkout flow
execution:
  branch: task/TASK-001-payment-contract
  worktree: worktrees/TASK-001
  retry_count: 0
review:
  required: true
  reviewer: reviewer
```

### 6.4 `review.json`

```json
{
  "task_id": "TASK-001",
  "verdict": "changes_requested",
  "score": 0.72,
  "checks": {
    "tests_passed": true,
    "acceptance_match": false,
    "scope_respected": true,
    "security_ok": true
  },
  "comments": [
    "API contract exists but missing failure response examples",
    "Acceptance criterion #1 not fully satisfied"
  ]
}
```

## 7. Definisi Agent

### 7.1 Team Lead Agent

**Tanggung jawab:**

- Membaca dokumen sumber.
- Memecah pekerjaan menjadi task kecil.
- Menentukan dependency.
- Memilih agent yang paling tepat.
- Menyusun acceptance criteria.
- Menentukan urutan iterasi.
- Meminta rework bila reviewer menolak.

**Tidak boleh:**

- Menulis langsung kode produk.
- Mengubah file source di luar mode planning.
- Meng-approve hasil sendiri.

### 7.2 Backend Worker

**Tanggung jawab:**

- Implementasi service, API, schema, migration, unit test.
- Membuat patch kecil dan fokus.

**Tidak boleh:**

- Menyentuh frontend kecuali task menyuruh.
- Mengubah scope task.
- Merge ke branch utama.

### 7.3 Frontend Worker

**Tanggung jawab:**

- Implementasi UI flow, component, state integration, test UI bila ada.

### 7.4 Docs/Test Worker

**Tanggung jawab:**

- Menulis test plan, unit/integration tests tambahan, docs perubahan, changelog.

### 7.5 Reviewer Agent

**Tanggung jawab:**

- Membandingkan hasil terhadap acceptance criteria.
- Membaca diff, test output, dan artifact.
- Memberikan verdict formal.

**Tidak boleh:**

- Memperbaiki kode sendiri pada mode review normal.
- Mengganti acceptance criteria.

## 8. Prompt Strategy yang Benar

Jangan simpan prompt agent sebagai monolit besar. Pisahkan menjadi beberapa lapis:

1. **System identity**: siapa agent itu, apa perannya.
2. **Project policy**: aturan repo, coding rules, done criteria.
3. **Task brief**: tugas spesifik, scope, file target, acceptance criteria.
4. **Execution constraints**: timeout, allowed tools, budget, forbidden actions.
5. **Output schema**: format json/yaml yang wajib dihasilkan.

### Contoh prompt Team Lead

```md
You are the Team Lead Agent for this repository.
Your job is to read source documents, break them into executable tasks, assign each task to the best specialist agent, and define clear acceptance criteria.
Do not write production code.
Do not approve work.
Return only valid YAML matching task schema.
```

### Contoh prompt Reviewer

```md
You are the Reviewer Agent.
You must evaluate the completed work against the acceptance criteria, diff summary, and test results.
Your job is to return one of: approved, changes_requested, blocked.
Do not rewrite the task scope.
Return strict JSON only.
```

## 9. Lifecycle End-to-End

### 9.1 Alur utama

1. User menaruh dokumen ke `docs/inbox/`.
2. CLI menjalankan `ingest`.
3. Scanner memindahkan dokumen ke `docs/processed/` atau kategori final.
4. Team Lead membuat backlog dan task files.
5. Execution engine membuat worktree untuk task yang siap jalan.
6. Worker menerima context pack dan mengeksekusi task.
7. Sistem menjalankan test/checks lokal.
8. Reviewer membaca hasil.
9. Jika gagal, task kembali ke worker dengan feedback terstruktur.
10. Jika lolos, buat commit draft atau PR draft.
11. Status backlog diperbarui.

### 9.2 State machine

```text
INGESTED
  -> PLANNED
  -> ASSIGNED
  -> IN_PROGRESS
  -> REVIEW_PENDING
      -> CHANGES_REQUESTED -> ASSIGNED
      -> APPROVED -> DONE
      -> BLOCKED
```

### 9.3 Rule penting

- Task tidak boleh masuk `IN_PROGRESS` kalau dependency belum `DONE`.
- Task tidak boleh `DONE` kalau belum `APPROVED`.
- Worker tidak boleh menerima context mentah seluruh repo kecuali benar-benar perlu.
- Satu task = satu worktree = satu diff story.

## 10. CLI Command Design

Buat CLI yang jelas dan tajam. Contoh command set:

```bash
dteam init
dteam scan
dteam ingest
dteam plan
dteam tasks list
dteam task show TASK-001
dteam run TASK-001
dteam run --next
dteam run --epic EPIC-001
dteam review TASK-001
dteam approve TASK-001
dteam retry TASK-001
dteam logs --run latest
dteam status
dteam tui
```

### 10.1 Fungsi command utama

| Command | Fungsi |
|---|---|
| `init` | Membuat struktur `.digital-team/`, backlog, runs, config |
| `scan` | Memindai file baru di `docs/inbox/` |
| `ingest` | Parsing dokumen, kategorisasi, metadata extraction |
| `plan` | Menjalankan Team Lead untuk pecah PRD menjadi tasks |
| `run` | Menjalankan satu task atau batch task yang eligible |
| `review` | Menjalankan Reviewer Agent untuk task selesai |
| `status` | Menampilkan state backlog, task, queue, failures |
| `logs` | Menampilkan timeline run dan event agent |
| `tui` | Dashboard CLI interaktif |

## 11. TUI/CLI UI yang Bagus

CLI bagus bukan berarti penuh warna tanpa fungsi. Fokusnya adalah **operational clarity**.

### 11.1 Layout TUI yang disarankan

Panel utama:

- **Header**: project name, active branch, model routing, token budget hari ini.
- **Left pane**: daftar epic/task dan status badge.
- **Center pane**: detail task aktif, acceptance criteria, assigned agent, latest action.
- **Right pane**: run logs singkat, reviewer verdict, warnings.
- **Bottom bar**: shortcuts keyboard.

### 11.2 Warna status

- Gray: queued
- Blue: planning/running
- Yellow: review pending
- Red: blocked/failed
- Green: done

### 11.3 Prinsip UI terminal

- Jangan render terlalu banyak teks model mentah.
- Tampilkan ringkasan, bukan transcript penuh, sebagai default.
- Detail transcript dibuka saat user memilih inspect.
- Semua operasi harus tetap bisa dipakai non-interactive lewat command biasa.

## 12. Context Engineering

Ini bagian yang sering salah. Bukan model yang paling penting, tapi **context pack** yang paling tepat.

### 12.1 Isi context pack per task

- Task metadata.
- Acceptance criteria.
- File target yang boleh disentuh.
- Dependency summary.
- Ringkasan project architecture.
- Potongan file relevan.
- Coding rules.
- Output schema.

### 12.2 Jangan kirim seluruh repo

Mengirim seluruh repo ke agent itu malas, mahal, dan sering bikin output makin jelek. Context harus dipilih berdasarkan scope task.

### 12.3 Gunakan summary memory

Buat memory ringkas seperti:

- glossary istilah domain
- arsitektur inti
- keputusan penting (ADR)
- constraints proyek
- known pitfalls

## 13. Quality Gates

Setiap task harus melewati quality gate berlapis:

1. **Schema validation** untuk output planning/review.
2. **Scope validation**: file yang diubah masih dalam ruang lingkup task.
3. **Test validation**: unit/integration test sesuai jenis task.
4. **Policy validation**: lint, format, security, migration rules.
5. **Reviewer validation**: semantic correctness terhadap acceptance criteria.

### 13.1 Contoh rule gate

```yaml
checks:
  - name: format
    run: make fmt
  - name: lint
    run: make lint
  - name: test
    run: make test
  - name: review_schema
    run: python scripts/validate_review.py
```

### 13.2 Reviewer rubric

Reviewer memberi skor untuk:

- acceptance match
- scope discipline
- code quality
- regression risk
- documentation completeness
- test sufficiency

## 14. Isolasi Git dengan Worktree

Ini wajib kalau mau multi-task jalan sehat.

### 14.1 Kenapa worktree

- Satu task punya workspace sendiri.
- Agent tidak saling menimpa perubahan.
- Review jadi lebih bersih.
- Cleanup lebih mudah.

### 14.2 Contoh flow

```bash
git worktree add worktrees/TASK-001 -b task/TASK-001-payment-contract
git worktree add worktrees/TASK-002 -b task/TASK-002-checkout-tests
```

### 14.3 Aturan worktree

- Satu task aktif = satu worktree.
- Worker hanya boleh bekerja di worktree task sendiri.
- Reviewer membaca diff dari branch task, bukan dari working tree global.

## 15. Observability dan Audit

Kalau kamu tidak bisa menjawab “agent mana melakukan apa, kapan, dengan input apa, dan kenapa gagal”, maka sistemmu belum siap dipakai.

### 15.1 Simpan event seperti ini

```json
{
  "timestamp": "2026-06-02T21:00:00+07:00",
  "run_id": "run-001",
  "task_id": "TASK-001",
  "agent": "backend-worker",
  "event": "execution_started",
  "model": "openrouter/qwen-coder",
  "input_refs": ["TASK-001.yaml", "docs/prd/checkout-mvp.md"],
  "worktree": "worktrees/TASK-001"
}
```

### 15.2 Minimal observability checklist

- run history
- agent event stream
- cost/token usage
- retry count
- failed commands
- review verdict history
- artifact references

OpenAI Agents SDK menempatkan sessions, guardrails, dan tracing sebagai primitive penting, yang menguatkan bahwa observability bukan fitur tambahan, melainkan fondasi operasional untuk sistem agent [cite:18].

## 16. Security dan Guardrails

### 16.1 Batas minimum yang wajib

- Jangan beri shell access tanpa sandbox policy.
- Jangan izinkan akses network penuh kalau tidak perlu.
- Jangan simpan secret langsung di prompt.
- Jangan izinkan agent mengedit file di luar allowlist task.
- Jangan izinkan delete besar-besaran tanpa explicit approval policy.

### 16.2 Guardrail praktis

- allowed paths
- forbidden commands
- max modified files
- max diff size
- max retries
- required review before done
- manual approval untuk migration, infra, auth, payment

## 17. Tahapan Pembuatan dari Nol

Berikut urutan pembuatan yang masuk akal dari awal sampai usable MVP.

### Phase 0 — Definisikan scope MVP

Jangan mulai dari “multi-agent company operating system”. Mulai dari MVP sempit:

- 1 repo
- input dokumen markdown
- 1 Team Lead
- 2 Worker (`backend`, `docs-test`)
- 1 Reviewer
- SQLite untuk state
- git worktree untuk isolasi
- satu command TUI sederhana

**Deliverable phase ini:** dokumen scope, arsitektur, dan folder awal.

### Phase 1 — Bootstrap project

1. Buat repo baru, misalnya `digital-team-cli`.
2. Inisialisasi Python project dengan `uv` atau `poetry`.
3. Tambahkan dependency awal.

Contoh dependency:

```bash
uv init digital-team-cli
cd digital-team-cli
uv add typer rich textual pydantic pyyaml sqlalchemy aiosqlite gitpython
uv add langgraph langchain litellm
```

4. Buat struktur package:

```text
src/dteam/
  cli.py
  config.py
  models/
  services/
  agents/
  prompts/
  tui/
  storage/
  git/
```

5. Siapkan command `dteam init`.

**Goal:** command pertama bisa membuat folder `.digital-team/`, `docs/`, `backlog/`, `runs/`, `worktrees/`.

### Phase 2 — Buat config dan schema

1. Definisikan `config.yaml`.
2. Definisikan schema Pydantic untuk project config, task, backlog, review.
3. Buat loader dan validator config.
4. Tambahkan command `dteam validate`.

**Goal:** sistem belum pintar, tapi config dan kontrak datanya sudah keras.

### Phase 3 — Ingestion pipeline

1. Implement `dteam scan` dan `dteam ingest`.
2. Baca file dari `docs/inbox/`.
3. Deteksi tipe dokumen: PRD, ADR, notes, task request.
4. Simpan metadata dokumen ke SQLite.
5. Pindahkan file ke folder kategori.

**Goal:** dokumen masuk dengan tertib dan bisa dilacak.

### Phase 4 — Team Lead planning engine

1. Buat prompt Team Lead.
2. Buat adapter LLM dengan structured output.
3. Jalankan Team Lead pada satu PRD.
4. Hasilnya harus berupa backlog + task files valid.
5. Simpan hasil ke `backlog/`.

**Goal:** PRD berubah menjadi task YAML yang rapi.

### Phase 5 — Task execution engine

1. Implement scheduler sederhana.
2. Filter task yang status-nya `ASSIGNED` dan dependency-nya selesai.
3. Buat worktree untuk task.
4. Bangun context pack task.
5. Jalankan worker agent.
6. Simpan artifact execution.

**Goal:** satu task bisa dieksekusi end-to-end sampai menghasilkan diff.

### Phase 6 — Review engine

1. Jalankan checks lokal: lint, test, schema.
2. Kumpulkan diff summary.
3. Kirim ke Reviewer Agent.
4. Simpan verdict.
5. Kalau `changes_requested`, buat feedback packet ke worker.

**Goal:** task tidak selesai tanpa review.

### Phase 7 — TUI dashboard

1. Bangun TUI sederhana dengan Textual.
2. Buat layar status run.
3. Buat list task dan panel detail.
4. Tambahkan live log tail.
5. Tambahkan shortcut keyboard untuk run/review/retry.

**Goal:** CLI enak dipantau dan tidak terasa buta.

### Phase 8 — Parallelism terbatas

1. Tambahkan worker pool.
2. Batasi concurrency dengan config.
3. Hormati dependency graph.
4. Pastikan log dan state tidak saling rusak.

**Goal:** dua atau tiga task bisa berjalan paralel tanpa chaos.

### Phase 9 — Hardening

1. Tambahkan guardrails untuk path dan command.
2. Tambahkan token/cost accounting.
3. Tambahkan retry policy.
4. Tambahkan manual approval untuk task sensitif.
5. Tambahkan snapshot summary per run.

**Goal:** dari demo jadi alat kerja nyata.

## 18. Implementasi Step-by-Step Sangat Konkret

Bagian ini adalah checklist yang bisa langsung dieksekusi.

### Step 1 — Buat repo dan dependency

```bash
mkdir digital-team-cli && cd digital-team-cli
uv init
uv add typer rich textual pydantic pyyaml sqlalchemy aiosqlite gitpython
uv add langgraph langchain litellm
mkdir -p src/dteam
mkdir -p tests
```

### Step 2 — Buat entrypoint CLI

File `src/dteam/cli.py`:

```python
import typer

app = typer.Typer(help="Digital Team CLI")

@app.command()
def hello():
    print("dteam ready")

if __name__ == "__main__":
    app()
```

Tambahkan script launcher di `pyproject.toml`.

### Step 3 — Implement command `init`

`dteam init` harus membuat:

- `.digital-team/config.yaml`
- `.digital-team/agents/*.md`
- `.digital-team/policies/*.md`
- `docs/inbox/`
- `backlog/tasks/`
- `runs/`
- `worktrees/`

### Step 4 — Implement config loader

Buat `ProjectConfig` dengan Pydantic. Validasi:

- model names ada
- main branch ada
- max parallel > 0
- reviewer aktif bila review_required true

### Step 5 — Implement storage

Buat tabel SQLite minimal:

- documents
- epics
- tasks
- task_runs
- reviews
- agent_events

### Step 6 — Implement scanner

`dteam scan` menampilkan file baru di inbox. `dteam ingest` memproses file lalu mengisi tabel documents.

### Step 7 — Implement Team Lead call

1. Ambil dokumen PRD.
2. Bentuk planning prompt.
3. Minta output structured YAML/JSON.
4. Validasi dengan schema.
5. Simpan ke backlog.

### Step 8 — Implement scheduler

Scheduler memilih task dengan aturan:

- status `ASSIGNED`
- semua dependency `DONE`
- belum melebihi retry limit
- belum ada run aktif

### Step 9 — Implement worktree manager

Service ini bertugas:

- create branch task
- create worktree
- cleanup worktree
- generate diff summary

### Step 10 — Implement worker execution

Worker flow:

1. load task
2. build context pack
3. call model
4. write/edit files di worktree
5. jalankan checks
6. simpan summary

### Step 11 — Implement reviewer

Reviewer input:

- task brief
- acceptance criteria
- changed files
- diff summary
- local checks result

Reviewer output:

- verdict
- confidence/score
- comments
- next action

### Step 12 — Implement retry loop

Kalau `changes_requested`:

1. update task status ke `ASSIGNED`
2. tambah retry_count
3. buat repair packet
4. jalankan worker lagi

### Step 13 — Implement status command

`dteam status` harus bisa menampilkan:

- total docs pending
- total tasks by state
- active runs
- blocked tasks
- last review verdict
- latest cost estimate

### Step 14 — Implement TUI

Buat screen awal berisi:

- task table
- selected task detail
- live event log
- action footer

### Step 15 — Tambahkan test

Minimal test yang wajib ada:

- config validation
- task schema validation
- dependency resolution
- retry behavior
- review state transition
- worktree creation

## 19. Skeleton Modul Python

```text
src/dteam/
├── cli.py
├── config.py
├── constants.py
├── schemas.py
├── storage/
│   ├── db.py
│   ├── models.py
│   └── repos.py
├── agents/
│   ├── router.py
│   ├── team_lead.py
│   ├── backend_worker.py
│   ├── docs_test_worker.py
│   └── reviewer.py
├── services/
│   ├── scanner.py
│   ├── ingestor.py
│   ├── planner.py
│   ├── scheduler.py
│   ├── executor.py
│   ├── reviewer.py
│   ├── context_builder.py
│   └── run_manager.py
├── git/
│   ├── worktree.py
│   └── diff.py
└── tui/
    ├── app.py
    └── screens.py
```

## 20. LangGraph Mapping

Gunakan graph sederhana dulu.

### 20.1 Node awal

- `ingest_docs`
- `plan_tasks`
- `select_next_task`
- `build_context`
- `run_worker`
- `run_checks`
- `review_task`
- `handle_review_result`
- `finalize_task`

### 20.2 State graph

```python
class RunState(TypedDict):
    run_id: str
    epic_id: str | None
    task_id: str | None
    current_status: str
    retry_count: int
    review_verdict: str | None
```

### 20.3 Handoff use case

LangGraph menyediakan supervisor dan handoff tool untuk delegasi antar-agent, sehingga Team Lead dapat mendelegasikan task ke specialist agent dengan pola yang tetap eksplisit dan dapat ditelusuri [cite:17][cite:14].

## 21. Roadmap 30 Hari

### Minggu 1

- bootstrap repo
- init command
- config + schema
- SQLite storage
- scan + ingest

### Minggu 2

- Team Lead planning
- backlog/task generation
- scheduler dasar
- worktree manager

### Minggu 3

- worker execution
- local checks
- reviewer engine
- retry flow

### Minggu 4

- TUI dashboard
- logs + traces
- hardening guardrails
- end-to-end testing di repo contoh

## 22. Kesalahan Desain yang Harus Dihindari

### 22.1 Membiarkan semua agent berbicara bebas

Ini hampir selalu terlihat keren di demo dan buruk di operasi nyata.

### 22.2 Satu agent diberi semua peran

Kalau Team Lead ikut coding, review, dan approve, maka sistem kehilangan pemisahan tanggung jawab.

### 22.3 Context terlalu besar

Mengirim seluruh repo ke semua agent membuat biaya naik, latency naik, dan presisi turun.

### 22.4 Tidak ada quality gate formal

Tanpa schema, checks, dan reviewer verdict, kamu tidak membangun sistem engineering; kamu hanya membangun auto-complete mahal.

### 22.5 Tidak ada audit trail

Kalau hasil agent salah dan kamu tidak tahu dari mana asal kesalahannya, kepercayaan sistem akan runtuh sangat cepat.

## 23. Definisi MVP Selesai

MVP dianggap selesai bila semua syarat ini terpenuhi:

- User dapat menaruh PRD markdown ke `docs/inbox/`.
- `dteam ingest && dteam plan` menghasilkan backlog dan task YAML valid.
- `dteam run --next` menjalankan satu task di worktree terpisah.
- Worker menghasilkan perubahan file dan menjalankan checks.
- Reviewer memberi verdict formal.
- Task yang lolos berpindah ke `DONE`.
- TUI dapat menampilkan task states dan run log.
- Semua run tersimpan di `runs/`.

## 24. Rekomendasi Final

Bangun sistem ini dengan pendekatan **sempit, keras, dan terukur**. LangGraph cocok untuk lapisan orchestrator karena menyediakan pola supervisor dan handoff untuk multi-agent workflow yang terstruktur [cite:17][cite:14].

Adopsi pula prinsip guardrails, sessions, dan tracing sebagai fondasi operasional, karena primitives tersebut ditekankan dalam OpenAI Agents SDK dan memang relevan langsung untuk sistem yang harus dapat diaudit [cite:18].

Urutan yang paling waras adalah:

1. buat folder structure dan data contract
2. bangun planning engine
3. bangun execution engine satu worker dulu
4. tambahkan reviewer gate
5. baru tambahkan TUI dan paralelisme

Jangan mulai dari “AI company OS”. Mulai dari satu PRD, satu backlog, satu task, satu worktree, satu review loop. Itu yang benar-benar bisa hidup.
