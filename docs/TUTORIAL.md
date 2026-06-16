# GodotCoder Tutorial

Step-by-step guide from zero to playable Godot game using only the terminal.

---

## 1. Install

```bash
git clone https://github.com/reelmesh/GodotCoder.git
cd GodotCoder
npm install
npm run build
```

Verify it works:

```bash
node dist/cli.js --help
```

**Requirements**: Node.js ≥22.19, Godot 4.3+ (native or Flatpak).

---

## 2. Your First Game — 60 Seconds

```bash
mkdir ~/my-first-game
cd ~/my-first-game
node ~/GodotCoder/dist/cli.js
```

Inside the interactive shell:

```text
> /make make a 2d asteroid shooter where you dodge rocks and collect stars
```

GodotCoder will:
1. Create `project.godot`, `scenes/main.tscn`, `scripts/main.gd`
2. Write planning artifacts (brief, GDD, technical plan, tasks)
3. Run the agent harness
4. Build the game files
5. Validate with Godot
6. Record the run under `.godotcoder/runs/`

Launch it:

```text
> /play
```

Or from bash directly:

```bash
node ~/GodotCoder/dist/cli.js pipeline "make a 2d asteroid shooter" --play
```

---

## 3. Interactive Shell Commands

Start anywhere (inside or outside a Godot project):

```bash
node dist/cli.js
```

### Navigation

| Command | What it does |
|---------|-------------|
| `/menu` | Open the home menu with all actions |
| `/help` | Show the command palette |
| `/clear` | Clear the terminal |
| `/exit` | Quit |

### Game Creation

| Command | What it does |
|---------|-------------|
| `/make <idea>` | Full pipeline: plan → build → validate |
| `/pipeline <idea>` | Same as `/make` |
| `/plan <idea>` | Write planning artifacts only |
| `/build <task>` | Preview a code change |
| `/apply` | Apply the pending preview |
| `/reject` | Discard the pending preview |
| `/preview <task>` | Preview only, no writes |

### Inspect & Validate

| Command | What it does |
|---------|-------------|
| `/status` | Show workspace + runtime summary |
| `/inspect` | Scan project.godot, scenes, scripts |
| `/validate` | Run Godot headless validation |
| `/check` | Same as `/validate` |
| `/validate --smoke` | Quick 3-second smoke test |
| `/validate --export` | Test export presets |
| `/repair` | Validate → fix → revalidate |
| `/runtime doctor` | Detect Godot install |

### Models & AI

| Command | What it does |
|---------|-------------|
| `/models` | Show configured model provider |
| `/ask <prompt>` | Ask the configured LLM |
| `/harness <goal>` | Multi-agent workflow |
| `/run <goal>` | Same as `/harness` |
| `/auth` | Manage API keys |

### Run & Debug

| Command | What it does |
|---------|-------------|
| `/runs` | Browse harness run history |
| `/history` | Same as `/runs` |
| `/play` | Launch the game |
| `/playtest` | Automated 5-second test |
| `/open` | Open in Godot editor |
| `/settings` | Configure preferences |

### Modes

| Command | What it does |
|---------|-------------|
| `/mode plan` | Read-only planning mode |
| `/mode build` | Implementation mode (default) |

In **build mode**, typing anything without a `/` prefix is treated as a build prompt and previews changes. In **plan mode**, it runs plan.

---

## 4. One-Shot CLI Commands

All shell commands work from bash too — no interactive session needed.

### Create a game from nothing

```bash
# Preview first (no files written)
node dist/cli.js pipeline "make a 2d platformer with coins" --preview

# Build and play
node dist/cli.js pipeline "make a 2d platformer with coins" --play

# With LLM code generation
node dist/cli.js pipeline "make a cozy puzzle game" --play

# JSON output for scripts
node dist/cli.js pipeline "make a 2d shooter" --json
```

### Work with an existing Godot project

```bash
cd ~/my-existing-godot-project

# Check runtime
node ~/GodotCoder/dist/cli.js runtime doctor

# Inspect the project
node ~/GodotCoder/dist/cli.js inspect

# Validate
node ~/GodotCoder/dist/cli.js validate

# Validate with JSON output
node ~/GodotCoder/dist/cli.js validate --json

# Quick smoke test (3 seconds)
node ~/GodotCoder/dist/cli.js validate --smoke

# Test export presets
node ~/GodotCoder/dist/cli.js validate --export

# Auto-repair validation errors
node ~/GodotCoder/dist/cli.js repair
```

### Plan before building

```bash
node dist/cli.js plan "make a vampire survivors clone"
```

Writes under `.godotcoder/`:

```text
brief.md              # One-paragraph pitch
gdd.md                # Game design document
technical-plan.md     # Architecture decisions
tasks.md              # Implementation checklist
decisions.md          # Recorded trade-offs
risk-log.md           # Known risks
```

Read the plans, then start building:

```bash
node dist/cli.js build "add player movement with WASD" --preview
```

---

## 5. LLM-Powered Code Generation

### Configure a provider

**Ollama** (local, free):

```bash
node dist/cli.js models use --provider ollama --model llama3.1
```

**LM Studio** (local, free):

```bash
node dist/cli.js models use --provider lmstudio --model qwen/qwen3.6-27b
```

**OpenAI** (cloud):

```bash
node dist/cli.js models use --provider openai --model gpt-4o --api-key-env OPENAI_API_KEY
node dist/cli.js auth login --provider openai --api-key sk-...
```

**Anthropic** (cloud):

```bash
node dist/cli.js models use --provider anthropic --model claude-sonnet-4-20250514 --api-key-env ANTHROPIC_API_KEY
node dist/cli.js auth login --provider anthropic --api-key sk-ant-...
```

**Any OpenAI-compatible API**:

```bash
node dist/cli.js models use --provider openai-compatible --model your-model \
  --base-url https://your-api.example.com/v1 \
  --api-key-env YOUR_API_KEY_ENV
```

### Ask questions

```bash
node dist/cli.js ask "How do I make a character double-jump in Godot 4?"
```

Response includes the model identifier and content:

```text
openai:gpt-4o
To implement double-jumping in Godot 4, use a jump counter that resets
when the character lands. In your CharacterBody2D script:
...
```

### Generate code with an LLM

```bash
# Preview LLM-generated code
node dist/cli.js build "add a dash move with cooldown UI" --preview

# Apply it
node dist/cli.js build "add a dash move with cooldown UI" --apply

# Full pipeline with LLM
node dist/cli.js pipeline "make a cozy puzzle game" --play
```

LLM generation is gated by acceptance checks:
- Must produce a scene or scene update
- Must include a gameplay script
- Must have input handling
- Must have visible feedback
- Must have an objective or fail state
- Must use Godot 4.3+ APIs only

If the model fails, GodotCoder records the attempt under `.godotcoder/model-failures/` and falls back to the deterministic builder.

---

## 6. Harness: Multi-Agent Workflow

The harness runs a BMAD-style sequence of specialized agents:

```bash
node dist/cli.js harness "make a 2d platformer with coins" --apply
```

Agent phases:

| Agent | Role |
|-------|------|
| Orchestrator | Routes work, enforces gates |
| Scout | Indexes project files |
| Producer | Creates milestone backlog |
| Designer + Architect | Writes GDD, technical plan |
| Docs Librarian | Selects official Godot docs |
| Gameplay Engineer | Generates/applies code |
| QA Validator | Runs Godot validation |

Output:

```text
.godotcoder/runs/run_20260616T120000_000000.json
.godotcoder/patches/patch_20260616T120000_000000/record.json
.godotcoder/validations/val_20260616T120000_000000.json
```

View past runs:

```bash
node dist/cli.js runs
node dist/cli.js runs show run_20260616T120000_000000
```

---

## 7. Build Previews + Diffs

Builds preview by default. See exactly what will change:

```bash
node dist/cli.js build "add a health bar HUD" --preview
```

Output shows a line-level diff:

```text
Build preview
Adds a health bar HUD to the main scene
create res://scripts/hud.gd (+24 -0, 0 -> 24 lines)
--- /dev/null
+++ res://scripts/hud.gd
+extends Control
+
+var health := 100
+
+func _ready() -> void:
+    update_bar()
...
modify res://scripts/main.gd (+3 -0, 42 -> 45 lines)
  func _ready() -> void:
      print("ready")
+     var hud = preload("res://scripts/hud.gd").instantiate()
+     add_child(hud)
```

Then decide:

```text
> /apply    # write the files
> /reject   # discard
```

---

## 8. Repair: Auto-Fix Validation Errors

```bash
# Run repair on current project
node dist/cli.js repair

# See repair history
node dist/cli.js repair list

# Show what a repair changed
node dist/cli.js repair diff repair_20260616T120000_000000

# Undo a repair
node dist/cli.js repair undo repair_20260616T120000_000000
```

Repair fixes:
- **Missing script references**: Creates placeholder `.gd` files
- **Missing scene references**: Creates minimal `.tscn` files
- **Missing resources**: Creates placeholder `.tres`, `.res`, images
- **Godot 3 → 4 migrations**: Updates 25+ deprecated APIs:
  - `export var` → `@export var`
  - `onready var` → `@onready var`
  - `instance()` → `instantiate()`
  - `yield(...)` → `await ...`
  - `KinematicBody2D` → `CharacterBody2D`
  - `Pool*Array` → `Packed*Array`
  - `OS.get_ticks_msec()` → `Time.get_ticks_msec()`
  - `connect("signal", target, "method")` → `signal.connect(callable)`
  - And 15 more...

---

## 9. Runtime Management

```bash
# Detect installed Godot
node dist/cli.js runtime doctor

# Pin a specific Godot command
node dist/cli.js runtime use godot
node dist/cli.js runtime use godot4
node dist/cli.js runtime use flatpak run org.godotengine.Godot
node dist/cli.js runtime use /opt/godot/custom-godot --editor
```

Stored in `.godotcoder.local/runtime-overrides.json`.

---

## 10. Settings & Auth

```bash
# Open settings menu
node dist/cli.js settings

# Quick-set from command line
node dist/cli.js settings default-mode build
node dist/cli.js settings approval-mode preview
node dist/cli.js settings provider ollama
node dist/cli.js settings diffs compact

# View current
node dist/cli.js settings --json

# Manage API keys
node dist/cli.js auth login --provider openai --api-key sk-abc123
node dist/cli.js auth logout --provider openai
node dist/cli.js auth --json
```

Secrets stored in `.godotcoder.local/secrets.json` with mode `600`.

---

## 11. Official Godot Docs

```bash
# Search docs
node dist/cli.js docs search input

# List all doc sources
node dist/cli.js docs list

# Cache a full doc page for offline use
node dist/cli.js docs cache class-input
node dist/cli.js docs cache gdscript-basics

# Show cached doc
node dist/cli.js docs show class-input

# JSON output
node dist/cli.js docs list --json
```

Cached docs are used by the LLM code generator for grounding.

---

## 12. Automated Playtesting

Runs the game headlessly for 5 seconds with random input simulation:

```bash
# Direct playtest
node dist/cli.js playtest

# Via play command
node dist/cli.js play --test

# JSON output
node dist/cli.js playtest --json
```

Detects runtime crashes, script errors, and premature exits:

```json
{
  "ok": false,
  "errors": [
    "SCRIPT ERROR: Parse Error at res://scripts/player.gd:12"
  ],
  "durationMs": 1234
}
```

---

## 13. RPC: Editor Integration

Stable JSON envelopes for external tools and editor plugins:

```bash
# Workspace status
node dist/cli.js rpc workspace.status --json

# Git change summary
node dist/cli.js rpc workspace.changes --json

# Project inspection
node dist/cli.js rpc project.inspect --json

# Runtime check
node dist/cli.js rpc runtime.doctor --json

# Validate scene
node dist/cli.js rpc validation.scene --scene res://scenes/main.tscn --json

# Build preview (no writes)
node dist/cli.js rpc build.preview --prompt "add a health bar" --json

# Debug error text
node dist/cli.js rpc debug.current --error "Parse Error at res://scripts/player.gd:42" --json

# Editor context (from Godot plugin)
node dist/cli.js rpc editor.explain --context '{"current_path":"res://scenes/main.tscn","selected_nodes":[{"name":"Player","class":"CharacterBody2D"}]}' --json

# Run validation
node dist/cli.js rpc validation.run --json
```

All responses use `{ ok, method, result, error, diagnostics }`.

---

## 14. Greenfield vs Brownfield

### Greenfield (new project from scratch)

```bash
mkdir my-game && cd my-game
node ~/GodotCoder/dist/cli.js pipeline "make a 2d shooter" --play
```

GodotCoder creates the project, builds files, validates, launches.

### Brownfield (existing Godot project)

```bash
cd ~/my-existing-project
node ~/GodotCoder/dist/cli.js
```

Inside shell:

```text
> /inspect
> /validate
> /build add a dash move to the player controller --preview
> /apply
> /validate
> /play
```

---

## 15. Piped / Non-TTY Usage

Feed commands via stdin:

```bash
printf '/mode plan\nmake a 2d asteroid shooter\n/exit\n' | node dist/cli.js
```

Useful for CI, scripts, or automated testing:

```bash
#!/bin/bash
# ci-test.sh — Validate a Godot project in CI
cd my-game
node /opt/GodotCoder/dist/cli.js inspect --json
node /opt/GodotCoder/dist/cli.js validate --json
node /opt/GodotCoder/dist/cli.js validate --export --json
```

---

## 16. Workspace Layout

After running `init` or any pipeline command:

```text
my-game/
  project.godot
  scenes/main.tscn
  scripts/main.gd
  .godotcoder/
    brief.md
    gdd.md
    technical-plan.md
    tasks.md
    decisions.md
    risk-log.md
    backlog.md
    agent-roster.json
    runtime-profile.json
    project-index.json
    runs/                    # Harness run records
    patches/                 # Change records with SHA-256
    validations/             # Godot validation reports
    repairs/                 # Repair attempts + diffs
    model-failures/          # Failed LLM attempts
    cache/docs/              # Cached Godot documentation
  .godotcoder.local/
    runtime-overrides.json   # Pinned Godot command
    model-config.json        # LLM provider config
    user-settings.json       # Preferences
    secrets.json             # API keys (mode 600)
```

---

## 17. Common Workflows

### "I have a game idea"

```bash
node dist/cli.js plan "make a bullet heaven survivor game"
# Read .godotcoder/brief.md and .godotcoder/gdd.md
node dist/cli.js build "create the player character that moves with WASD" --preview
# Review diff
node dist/cli.js build "create the player character that moves with WASD" --apply
node dist/cli.js validate
node dist/cli.js play
```

### "My Godot project has errors"

```bash
node dist/cli.js validate --json
node dist/cli.js repair
node dist/cli.js validate --json  # verify fixed
node dist/cli.js repair diff      # see what changed
```

### "I want AI to write the code"

```bash
node dist/cli.js models use --provider lmstudio --model qwen/qwen3.6-27b
node dist/cli.js pipeline "make a cozy puzzle game about matching colors" --play
```

### "I want to script Godot validation in CI"

```bash
node dist/cli.js validate --smoke --json
node dist/cli.js validate --export --json
node dist/cli.js repair --json
```

### "I'm building a Godot editor plugin"

```bash
# Query from your plugin
node dist/cli.js rpc project.inspect --json
node dist/cli.js rpc validation.scene --scene res://scenes/current.tscn --json
node dist/cli.js rpc editor.explain --context "$EDITOR_CONTEXT" --json
```
