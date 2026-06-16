# GodotCoder

GodotCoder is an LLM-driven CLI agent and Godot editor plugin for building Godot games. It uses configured language models to generate complete playable game code through preview/apply boundaries, automated validation, and deterministic repair.

All game code generation is LLM-driven. There are no genre templates or recipe pickers — describe any game idea and the configured model generates a first playable vertical slice. GodotCoder provides the scaffolding, planning artifacts, patch records, validation, and repair loop around the model output.

## Current Status

This repository currently contains the first implementation slice:

- Interactive terminal shell: `godotcoder`
- Workspace initialization: `godotcoder init`
- Workspace status: `godotcoder status`
- Runtime detection: `godotcoder runtime doctor`
- Runtime override selection: `godotcoder runtime use <godot command>`
- Project inspection: `godotcoder inspect`
- Godot-backed validation: `godotcoder validate`
- Standalone deterministic repair: `godotcoder repair`
- Agent roster: `godotcoder agents`
- Settings area: `godotcoder settings`
- Local auth area: `godotcoder auth`
- Model provider support: `godotcoder models`, `godotcoder ask`
- Official Godot docs search/cache: `godotcoder docs`
- Directed multi-agent harness: `godotcoder harness <game goal>`
- First playable prototype build: `godotcoder build`
- End-to-end playable pipeline: `godotcoder pipeline <game idea>`
- Godot launch helper: `godotcoder play` (and playtesting: `godotcoder playtest` or `play --test`)
- Editor-integration JSON envelope: `godotcoder rpc <method>`

Model-backed code generation is the only code generation path. All writes go through LLM generation, preview/apply boundaries, path validation, patch records, and optional Godot validation.

## Design Direction

GodotCoder is intentionally based on three reference pillars:

- **Pi Coding Agent:** provider abstraction, streaming, tool calls, model registry, context persistence, OAuth/API key handling, and token/cost tracking.
- **BMAD Methodology:** planning artifacts, specialist roles, task decomposition, acceptance criteria, and delivery discipline.
- **Godot AI Plugin Reference:** editor integration patterns, Godot context, diff application, watch/debug mode, scene/script awareness, and Godot-specific skills.

The product direction is:

- TypeScript/Node CLI.
- Godot 4.3 or newer only.
- Linux first.
- Native Godot and Flatpak Godot as first-class runtime targets.
- Official Godot documentation as the primary trusted knowledge source.
- Godot executable as the primary validator.
- Subprocess JSON protocol for the future Godot editor integration.
- Generated game code should stay Godot-native and GDScript-first.

## Install

Requirements:

- Node.js `>=22.19.0`
- npm
- Godot 4.3 or newer available as either a native command (`godot` or `godot4`) or a Flatpak app

Install dependencies and build:

```bash
npm install
npm run build
```

Run from this checkout:

```bash
node dist/cli.js
```

For local development, you can also run:

```bash
npm run dev
npm run check
npm run test:smoke
```

`test:smoke` builds the CLI and runs repeatable Node tests covering schema
validators, Godot config parser, Godot 3→4 GDScript migrations, and more.

Tests use Node's native test runner with `tsx`:

```bash
npm run test:smoke
# or run individual suites:
tsx --test test/schema.test.ts
tsx --test test/godot-config-parser.test.ts
tsx --test test/repair-migrations.test.ts
```

## Usage

Open a terminal inside either:

- an existing Godot project containing `project.godot`, or
- an empty/new folder where you want GodotCoder to scaffold a project.

Start the interactive shell:

```bash
node /path/to/GodotCoder/dist/cli.js
```

Available slash commands:

```text
/menu
/make <idea>
/pipeline <idea>
/play
/playtest
/help
/setup
/settings
/auth
/agents
/models
/ask <prompt>
/harness <goal>
/run <goal>
/runs
/status
/runtime doctor
/runtime use <cmd>
/doctor
/inspect
/validate
/repair
/rpc <method>
/check
/mode plan
/mode build
/plan <idea>
/preview <task>
/build <task>
/apply
/reject
/clear
/exit
```

Greenfield example:

```bash
mkdir my-asteroid-game
cd my-asteroid-game
node /path/to/GodotCoder/dist/cli.js
```

Then inside the shell:

```text
/make make a 2d asteroid shooter
/play
```

If no `project.godot` exists, the planning workflow creates a minimal Godot project:

```text
project.godot
scenes/main.tscn
scripts/main.gd
.godotcoder/
```

Build previews changes by default with a compact line diff and stores a pending build in the interactive shell. Use `/apply` to write the pending build or `/reject` to discard it.

The fastest end-to-end path is the pipeline command:

```bash
node /path/to/GodotCoder/dist/cli.js pipeline "make a 2d asteroid shooter"
node /path/to/GodotCoder/dist/cli.js pipeline "make a 2d platformer with coins" --play
```

Pipeline mode:

- creates a greenfield Godot project when needed,
- writes planning artifacts and backlog,
- runs the directed Godot agent harness,
- applies the current implementation slice,
- records a patch and harness run,
- validates through the configured Godot runtime,
- attempts bounded deterministic repair for known validation failures,
- optionally launches the game with `--play`.

Use preview mode when you want to inspect first:

```bash
node /path/to/GodotCoder/dist/cli.js pipeline "make a 2d asteroid shooter" --preview
```

Pipeline repair is enabled by default. Current deterministic repair rules:

- create missing `.gd` script placeholders for broken `res://...gd` references,
- create minimal `.tscn` scene and `.tres` resource placeholders for broken text resource references,
- migrate common Godot 3 GDScript APIs to Godot 4 names,
- record the repair under `.godotcoder/repairs/`,
- re-run Godot validation.

The Godot 4 migration pass currently covers old `export var` syntax, `Pool*Array`
types, `OS.get_ticks_*`, `deg2rad`, `rad2deg`, `linear2db`, `db2linear`,
`instance()`, `tool`, `onready var`, common renamed node classes, simple
`yield(owner, "signal")` calls, and simple `connect("signal", target, "method")`
calls. Disable repair with:

```bash
node /path/to/GodotCoder/dist/cli.js pipeline "make a 2d asteroid shooter" --no-repair
```

You can also run the repair loop directly on an existing project:

```bash
node /path/to/GodotCoder/dist/cli.js repair
node /path/to/GodotCoder/dist/cli.js repair list
node /path/to/GodotCoder/dist/cli.js repair diff [repair-id]
node /path/to/GodotCoder/dist/cli.js repair undo <repair-id>
node /path/to/GodotCoder/dist/cli.js repair --json
```

Standalone repair validates the current Godot project, applies known deterministic fixes when possible, writes a repair record, and re-runs Godot validation. It is intended for brownfield cleanup as well as pipeline recovery. You can inspect repair history with `repair list`, view side-by-side diffs of applied repairs with `repair diff`, and revert a repair cycle using `repair undo <repair-id>`.

You can also run an automated playtest to simulate 5 seconds of random user input headlessly to check for runtime/script exceptions:

```bash
node /path/to/GodotCoder/dist/cli.js playtest
node /path/to/GodotCoder/dist/cli.js play --test
```

Editor integration and external tools can use stable RPC-style JSON envelopes:

```bash
node /path/to/GodotCoder/dist/cli.js rpc workspace.status --json
node /path/to/GodotCoder/dist/cli.js rpc workspace.changes --json
node /path/to/GodotCoder/dist/cli.js rpc project.inspect --json
node /path/to/GodotCoder/dist/cli.js rpc runtime.doctor --json
node /path/to/GodotCoder/dist/cli.js rpc validation.run --json
node /path/to/GodotCoder/dist/cli.js rpc validation.scene --scene res://scenes/main.tscn --json
node /path/to/GodotCoder/dist/cli.js rpc docs.search --query input --json
node /path/to/GodotCoder/dist/cli.js rpc build.preview --prompt "make a 2d platformer" --json
node /path/to/GodotCoder/dist/cli.js rpc debug.current --error "Parse Error at res://scripts/player.gd:12" --json
node /path/to/GodotCoder/dist/cli.js rpc editor.context --context '{"current_path":"res://scenes/main.tscn"}' --json
node /path/to/GodotCoder/dist/cli.js rpc editor.explain --context '{"current_path":"res://scenes/main.tscn"}' --json
```

The bundled Godot editor plugin captures scene, selection, script, and open-scene context, auto-attaches that context to regular RPC calls, and keeps a selectable replay history in the dock.

Responses use `{ ok, method, result, error, diagnostics }`.

Harness workflow runs a BMAD-style Godot agent sequence:

```bash
node /path/to/GodotCoder/dist/cli.js harness "make a 2d platformer with coins"
node /path/to/GodotCoder/dist/cli.js harness "make a 2d platformer with coins" --apply
node /path/to/GodotCoder/dist/cli.js harness "make a 2d platformer with coins" --apply --repair
```

It writes:

```text
.godotcoder/agent-roster.json
.godotcoder/backlog.md
.godotcoder/runs/<run-id>.json
```

Phases: orchestrator, scout, producer, designer, architect, gameplay engineer, QA validator, docs librarian. Preview mode stops before writes beyond planning/scaffold artifacts. Apply mode writes patch records and runs Godot validation.

LLM providers are optional and can use cloud APIs or local HTTP servers:

```bash
# Ollama
node /path/to/GodotCoder/dist/cli.js models use --provider ollama --model llama3.1

# LM Studio local server (/api/v1)
node /path/to/GodotCoder/dist/cli.js models use --provider lmstudio --model local-model
node /path/to/GodotCoder/dist/cli.js auth login --provider lmstudio --api-key lm-studio-token

# OpenAI API
node /path/to/GodotCoder/dist/cli.js models use --provider openai --model your-model --api-key-env OPENAI_API_KEY
node /path/to/GodotCoder/dist/cli.js auth login --provider openai --api-key sk-...

# Anthropic API
node /path/to/GodotCoder/dist/cli.js models use --provider anthropic --model your-model --api-key-env ANTHROPIC_API_KEY
node /path/to/GodotCoder/dist/cli.js auth login --provider anthropic --api-key sk-ant-...

# Any OpenAI-compatible API
node /path/to/GodotCoder/dist/cli.js models use --provider openai-compatible --model your-model --base-url https://example.com/v1 --api-key-env YOUR_API_KEY_ENV
```

Use configured model:

```bash
node /path/to/GodotCoder/dist/cli.js ask "Review this Godot mechanic"
node /path/to/GodotCoder/dist/cli.js harness "make a 2d platformer with coins"
node /path/to/GodotCoder/dist/cli.js build "add a dash move and cooldown UI" --preview
node /path/to/GodotCoder/dist/cli.js build "add a dash move and cooldown UI" --apply
```

`harness`, `pipeline`, and `build` use the configured model to generate controlled Godot file changes. Writes go through path validation, preview/apply gates, patch records, and optional Godot validation. If no model is configured or the model output fails acceptance gates, the run is recorded as failed and the error is logged under `.godotcoder/model-failures/`.

For open-ended game creation prompts, controlled model output must pass first
playable acceptance gates: scene/script presence, input or frame processing,
visible feedback, an objective/fail/restart loop, and Godot 4.3+ API syntax.

GodotCoder does not load, download, or unload local models. For local providers such as LM Studio or Ollama, start/load the model in that tool first, then point GodotCoder at the running API endpoint and model name.

Use official Godot docs sources:

```bash
node /path/to/GodotCoder/dist/cli.js docs search input
node /path/to/GodotCoder/dist/cli.js docs list --json
node /path/to/GodotCoder/dist/cli.js docs cache class-input
node /path/to/GodotCoder/dist/cli.js docs show class-input
```

`docs cache` stores raw HTML, extracted text, and short excerpts under
`.godotcoder/cache/docs/`. Harness and pipeline runs write a docs context
artifact from trusted official Godot documentation sources. LLM build prompts
include matching official docs links and summaries as primary grounding.

LLM-driven game synthesis is the primary path. Deterministic prototype builders
exist only as internal bootstrap fallbacks for smoke tests and initial
scaffolding; they are optional accelerators, not a genre whitelist or limit on
original game structures.

Guided setup:

```bash
node /path/to/GodotCoder/dist/cli.js setup
```

`setup` opens one menu for runtime, model provider, auth, preferences, and status.
Menus use `[*]` selection markers with arrow-key navigation, plus `space` or `enter` to accept.

Settings and auth:

```bash
node /path/to/GodotCoder/dist/cli.js settings
```

`settings`, `models`, `auth`, and `runtime` open interactive menus in a terminal. Command shortcuts still exist for scripting:

```bash
node /path/to/GodotCoder/dist/cli.js settings default-mode plan
node /path/to/GodotCoder/dist/cli.js settings approval-mode preview
node /path/to/GodotCoder/dist/cli.js settings provider ollama
node /path/to/GodotCoder/dist/cli.js settings diffs compact
node /path/to/GodotCoder/dist/cli.js auth
node /path/to/GodotCoder/dist/cli.js auth logout --provider openai
```

Auth stores API keys in `.godotcoder.local/secrets.json`, ignored by git. Environment variables still win over local secrets when both exist.
For LM Studio servers with authentication enabled, use `LM_API_TOKEN` or `auth login --provider lmstudio`. GodotCoder defaults LM Studio to `http://127.0.0.1:1234` and calls `/api/v1/models` plus `/api/v1/chat`.

Applied build runs record changes under:

```text
.godotcoder/patches/<patch-id>/record.json
```

The record includes changed files, create/modify/unchanged operations, before/after SHA-256 hashes, and linked validation report IDs.

Subcommands are also available for scripting and future editor integration:

```bash
node /path/to/GodotCoder/dist/cli.js init
node /path/to/GodotCoder/dist/cli.js setup
node /path/to/GodotCoder/dist/cli.js settings
node /path/to/GodotCoder/dist/cli.js auth
node /path/to/GodotCoder/dist/cli.js agents
node /path/to/GodotCoder/dist/cli.js models
node /path/to/GodotCoder/dist/cli.js ask "Review this Godot game idea"
node /path/to/GodotCoder/dist/cli.js harness "make a 2d platformer with coins"
node /path/to/GodotCoder/dist/cli.js harness "make a 2d platformer with coins" --apply
node /path/to/GodotCoder/dist/cli.js pipeline "make a 2d asteroid shooter"
node /path/to/GodotCoder/dist/cli.js pipeline "make a 2d platformer with coins" --play
node /path/to/GodotCoder/dist/cli.js runs
node /path/to/GodotCoder/dist/cli.js play
node /path/to/GodotCoder/dist/cli.js play --editor
node /path/to/GodotCoder/dist/cli.js status
node /path/to/GodotCoder/dist/cli.js runtime doctor
node /path/to/GodotCoder/dist/cli.js runtime use godot
node /path/to/GodotCoder/dist/cli.js runtime use flatpak run org.godotengine.Godot
node /path/to/GodotCoder/dist/cli.js inspect
node /path/to/GodotCoder/dist/cli.js validate
node /path/to/GodotCoder/dist/cli.js plan "make a 2d asteroid shooter"
node /path/to/GodotCoder/dist/cli.js build "add a dash move and cooldown UI" --preview
node /path/to/GodotCoder/dist/cli.js build "build the first playable" --preview
node /path/to/GodotCoder/dist/cli.js build "build the first playable" --apply
```

Minimal Godot editor plugin scaffold lives under `addons/godotcoder/`. Add that
folder to a Godot project, enable plugin in Project Settings, and point `Command`
to the `godotcoder` binary or absolute CLI path.

The dock captures editor context, keeps recent RPC history in
`user://godotcoder/plugin-history.json`, and can round-trip editor context
through `godotcoder rpc editor.context --json`. RPC output is parsed into a
structured envelope view, stdout and stderr are shown separately, exit codes
are surfaced, and raw stdout stays visible for debugging. Regular dock RPC
calls also attach captured editor context when available. The dock also exposes
a `Debug` action that sends pasted console/error text to `debug.current`, and a
preview action that summarizes `build.preview` file counts and changed paths
without applying edits. `Explain` summarizes the selected scene/node/script
context against the inspected project. `Review` summarizes current git changes
without modifying the project. `Scene` resolves the current scene against the
project index before running broader validation.

Machine-readable output:

```bash
node /path/to/GodotCoder/dist/cli.js runtime doctor --json
node /path/to/GodotCoder/dist/cli.js models --json
node /path/to/GodotCoder/dist/cli.js inspect --json
node /path/to/GodotCoder/dist/cli.js validate --json
```

Runtime and model configs are stored in `.godotcoder.local/`, which is ignored by git because it is machine-specific. The shared `.godotcoder/runtime-profile.json` records the detected runtime, Godot version, Flatpak app metadata when relevant, and project signals from `project.godot`.

## Workspace

`godotcoder init` creates a `.godotcoder/` folder inside the Godot project.

Durable project artifacts:

```text
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
  agent-memory.json
  runs/
  model-failures/
  cache/docs/context.json
```

Generated/local artifacts are ignored by default:

```text
.godotcoder/cache/
.godotcoder/logs/
.godotcoder/sessions/
.godotcoder.local/
```

Common local config files:

```text
.godotcoder.local/
  runtime-overrides.json
  model-config.json
  user-settings.json
  secrets.json
```

## Architecture

```text
src/
  cli.ts                    Entry point, command routing
  commands/                 17 CLI command handlers (auth, build, harness, etc.)
  core/                     Business logic
    builders/               Deterministic game builders (asteroid-shooter, platformer)
    godot-config-parser.ts  project.godot INI parser + serializer
    godot-project-indexer.ts Project discovery, file walker, inspection
    godot-setting-editor.ts Safe project.godot mutation helpers
    godot-project.ts        Barrel re-export of the three modules above
    flags.ts                Shared flag parsing + provider defaults
    session-commands.ts     Single source of truth for all 29 slash commands
    completion.ts           Tab completion (derives from session-commands)
    providers.ts            LLM provider layer (OpenAI, Anthropic, Ollama, LM Studio)
    harness.ts              BMAD-style multi-agent workflow runner
    repair.ts               Deterministic validation repair + Godot 3→4 migration
    validation.ts           Godot headless validation (run, smoke, export)
    llm-build.ts            Controlled LLM code generation with acceptance gates
    preview.ts              LCS-based diff preview
    change-records.ts       Patch records with SHA-256 hashes
    settings.ts             User settings + secrets (mode 600)
    playtest.ts             Automated 5-second headless playtesting
    ...
```

## Documentation

- [HTML Documentation](docs/index.html) — complete navigable reference (open in browser)
- [Tutorial & Examples](docs/TUTORIAL.md) — step-by-step from zero to playable game
- [Product Requirements](docs/PRD.md)
- [Technical Design](docs/TECHNICAL_DESIGN.md)
- [Starting Prompt](docs/STARTING_PROMPT.md)
- [Hugging Face Godot Research](docs/RESEARCH_HUGGINGFACE_GODOT.md)
- [Implementation Status](docs/IMPLEMENTATION_STATUS.md)

## Roadmap

Next implementation slices:

1. Stronger LLM agent prompts and acceptance gates for open-ended game synthesis.
2. Safe project.godot mutation helpers for input maps and project settings.
3. Expand official Godot documentation retrieval beyond source metadata.
4. Godot editor integration prototype using subprocess JSON.
5. Schema guards for change records and validation reports.
