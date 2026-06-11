# GodotCoder

GodotCoder is a CLI-first AI development agent for building Godot games. It is designed to feel like a modern terminal coding agent while staying exclusively focused on Godot workflows, GDScript, Godot project files, and Godot-backed validation.

The long-term goal is a tool that helps a developer move from ideation to a playable/exportable Godot game through planning, project inspection, safe patches, validation, debugging, and a lightweight Godot editor integration.

## Current Status

This repository currently contains the first implementation slice:

- Interactive terminal shell: `godotcoder`
- Workspace initialization: `godotcoder init`
- Workspace status: `godotcoder status`
- Runtime detection: `godotcoder runtime doctor`
- Project inspection: `godotcoder inspect`
- Godot-backed validation: `godotcoder validate`

Model-backed code generation is not wired yet. The current `plan` workflow is deterministic: it can scaffold a greenfield Godot project and write initial planning artifacts. The next slice is model-backed expansion of that workflow.

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
/status
/runtime doctor
/doctor
/inspect
/validate
/check
/mode plan
/mode build
/plan <idea>
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

Subcommands are also available for scripting and future editor integration:

```bash
node /path/to/GodotCoder/dist/cli.js init
node /path/to/GodotCoder/dist/cli.js status
node /path/to/GodotCoder/dist/cli.js runtime doctor
node /path/to/GodotCoder/dist/cli.js inspect
node /path/to/GodotCoder/dist/cli.js validate
node /path/to/GodotCoder/dist/cli.js plan "make a 2d asteroid shooter"
```

Machine-readable output:

```bash
node /path/to/GodotCoder/dist/cli.js inspect --json
node /path/to/GodotCoder/dist/cli.js validate --json
```

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
  runtime-profile.json
  project-index.json
  agent-memory.json
```

Generated/local artifacts are ignored by default:

```text
.godotcoder/cache/
.godotcoder/logs/
.godotcoder/sessions/
.godotcoder.local/
```

## Documentation

- [Product Requirements](docs/PRD.md)
- [Technical Design](docs/TECHNICAL_DESIGN.md)
- [Starting Prompt](docs/STARTING_PROMPT.md)
- [Hugging Face Godot Research](docs/RESEARCH_HUGGINGFACE_GODOT.md)
- [Implementation Status](docs/IMPLEMENTATION_STATUS.md)

## Roadmap

Next implementation slices:

1. Runtime schemas with TypeBox or equivalent validation.
2. Improved `project.godot` parsing.
3. Runtime override support.
4. First model-backed expansion of the deterministic `plan` workflow.
5. Official Godot documentation source interface.
6. Godot editor integration prototype using subprocess JSON.
