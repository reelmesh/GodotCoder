# GodotCoder

GodotCoder is a CLI-first AI development agent for building Godot games. It is designed to feel like a modern terminal coding agent while staying exclusively focused on Godot workflows, GDScript, Godot project files, and Godot-backed validation.

The long-term goal is a tool that helps a developer move from ideation to a playable/exportable Godot game through planning, project inspection, safe patches, validation, debugging, and a lightweight Godot editor integration.

## Current Status

This repository currently contains the first implementation slice:

- Interactive terminal shell: `godotcoder`
- Workspace initialization: `godotcoder init`
- Workspace status: `godotcoder status`
- Runtime detection: `godotcoder runtime doctor`
- Runtime override selection: `godotcoder runtime use <godot command>`
- Project inspection: `godotcoder inspect`
- Godot-backed validation: `godotcoder validate`
- Agent roster: `godotcoder agents`
- Settings area: `godotcoder settings`
- Local auth area: `godotcoder auth`
- Model provider support: `godotcoder models`, `godotcoder ask`
- Directed multi-agent harness: `godotcoder harness <game goal>`
- First playable prototype build: `godotcoder build`

Model-backed code generation is not trusted to write files yet. Current LLM support is advisory through configured providers; edits still go through deterministic preview/apply boundaries and Godot validation.

## Design Direction

GodotCoder is intentionally based on three reference pillars:

- **Pi Coding Agent:** provider abstraction, streaming, tool calls, model registry, context persistence, OAuth/API key handling, and token/cost tracking.
- **BMAD Methodology:** planning artifacts, specialist roles, task decomposition, acceptance criteria, and delivery discipline.
- **Godot AI Plugin Reference:** editor integration patterns, Godot context, diff application, watch/debug mode, scene/script awareness, and Godot-specific skills.

The product direction is:

- TypeScript/Node CLI.
- Godot 4.x first.
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
- Godot 4.x available as either a native command (`godot` or `godot4`) or a Flatpak app

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
/help
/setup
/settings
/auth
/agents
/models
/ask <prompt>
/harness <goal>
/run <goal>
/status
/runtime doctor
/runtime use <cmd>
/doctor
/inspect
/validate
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
/mode plan
make a 2d asteroid shooter
/mode build
build the first playable
/apply
/check
/inspect
```

If no `project.godot` exists, the planning workflow creates a minimal Godot project:

```text
project.godot
scenes/main.tscn
scripts/main.gd
.godotcoder/
```

Build previews changes by default with a compact line diff and stores a pending build in the interactive shell. Use `/apply` to write the pending build or `/reject` to discard it.

Harness workflow runs a BMAD-style Godot agent sequence:

```bash
node /path/to/GodotCoder/dist/cli.js harness "make a 2d platformer with coins"
node /path/to/GodotCoder/dist/cli.js harness "make a 2d platformer with coins" --apply
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

# LM Studio OpenAI-compatible local server
node /path/to/GodotCoder/dist/cli.js models use --provider lmstudio --model local-model

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
node /path/to/GodotCoder/dist/cli.js harness "make a 2d platformer with coins" --llm
```

Model output is advisory in this slice. It does not directly write game files.

Guided setup:

```bash
node /path/to/GodotCoder/dist/cli.js setup
```

`setup` opens one menu for runtime, model provider, auth, preferences, and status.

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

Applied build runs record changes under:

```text
.godotcoder/patches/<patch-id>/record.json
```

The record includes changed files, create/modify/unchanged operations, before/after SHA-256 hashes, and linked validation report IDs.

The deterministic build slice currently supports prompt-selected prototypes for:

- 2D asteroid shooter prompts.
- 2D platformer prompts with jumping and coin collection.

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
node /path/to/GodotCoder/dist/cli.js status
node /path/to/GodotCoder/dist/cli.js runtime doctor
node /path/to/GodotCoder/dist/cli.js runtime use godot
node /path/to/GodotCoder/dist/cli.js runtime use flatpak run org.godotengine.Godot
node /path/to/GodotCoder/dist/cli.js inspect
node /path/to/GodotCoder/dist/cli.js validate
node /path/to/GodotCoder/dist/cli.js plan "make a 2d asteroid shooter"
node /path/to/GodotCoder/dist/cli.js build "build the first playable" --preview
node /path/to/GodotCoder/dist/cli.js build "build the first playable" --apply
```

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

## Documentation

- [Product Requirements](docs/PRD.md)
- [Technical Design](docs/TECHNICAL_DESIGN.md)
- [Starting Prompt](docs/STARTING_PROMPT.md)
- [Hugging Face Godot Research](docs/RESEARCH_HUGGINGFACE_GODOT.md)
- [Implementation Status](docs/IMPLEMENTATION_STATUS.md)

## Roadmap

Next implementation slices:

1. Improved `project.godot` parsing.
2. Provider/model layer promoted from advisory to agent task execution.
3. Official Godot documentation source interface.
4. Godot editor integration prototype using subprocess JSON.
5. Schema guards for change records and validation reports.
