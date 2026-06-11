# Repository Setup

## Purpose

This repository contains GodotCoder, a CLI-first AI development agent for Godot game projects.

The app should be developed as a focused Godot tool, not as a generic coding agent. Its generated game-code output should stay Godot-native and GDScript-first unless a project explicitly opts into another Godot-supported technology.

## What To Commit

Commit:

- Source code under `src/`
- Root package files
- Documentation under `docs/`
- Durable workspace examples when intentionally added

Do not commit:

- `node_modules/`
- `dist/`
- `source_projects/`
- `.godotcoder/cache/`
- `.godotcoder/logs/`
- `.godotcoder/sessions/`
- `.godotcoder.local/`

`source_projects/` contains local reference material and third-party codebases. It is intentionally ignored until specific code is audited and intentionally incorporated.

## Initial Repository Description

Suggested repository description:

```text
CLI-first AI development agent for building Godot games with Godot-native workflows, project inspection, runtime validation, and future editor integration.
```

## Suggested GitHub Topics

```text
godot
gdscript
ai-agent
coding-agent
gamedev
cli
typescript
linux
flatpak
```

