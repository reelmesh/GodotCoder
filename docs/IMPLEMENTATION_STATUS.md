# Implementation Status

Date: 2026-06-12

## Implemented

First TypeScript/Node CLI slice:

- `godotcoder init`
- `godotcoder` interactive session shell
- `godotcoder setup`
- `godotcoder settings`
- `godotcoder settings set <key> <value>`
- `godotcoder settings default-mode plan|build`
- `godotcoder settings approval-mode preview|auto-apply`
- `godotcoder settings provider <provider>`
- `godotcoder settings diffs compact|full`
- `godotcoder auth`
- `godotcoder auth login --provider <provider> --api-key <key>`
- `godotcoder auth logout --provider <provider>`
- `godotcoder agents`
- `godotcoder models`
- `godotcoder models use --provider <provider> --model <model>`
- `godotcoder ask <prompt>`
- `godotcoder harness <game goal>`
- `godotcoder status`
- `godotcoder runtime doctor`
- `godotcoder runtime use <godot command>`
- `godotcoder inspect`
- `godotcoder validate`
- `godotcoder plan <idea>`
- `godotcoder build <task>`

Core modules:
- Workspace path management.
- Godot-specific agent roster with ownership boundaries and gates.
- Directed harness runner with orchestrator, scout, producer, designer, architect, gameplay engineer, QA validator, and docs librarian phases.
- Provider layer for OpenAI-compatible APIs, OpenAI API, Anthropic API, Ollama, and LM Studio.
- Model config in `.godotcoder.local/model-config.json`.
- User settings in `.godotcoder.local/user-settings.json`.
- Interactive menu-first settings UI in TTY sessions.
- Bracketed `[*]` menu selection with arrow-key navigation and `space`/`enter` accept.
- Local provider secrets in `.godotcoder.local/secrets.json`, with redacted auth status.
- Advisory LLM calls through `ask` and `harness --llm`.
- Godot project root discovery.
- Basic `project.godot` parsing.
- Project index generation.
- Export preset extraction from `export_presets.cfg` when present.
- Runtime discovery for Flatpak and native Godot binaries.
- Local runtime overrides in `.godotcoder.local/runtime-overrides.json` for native, Flatpak, and custom Godot commands.
- Runtime profiles enriched with Godot project config version, feature tags, main scene, autoloads, plugins, and export preset signals.
- Lightweight schema guards for runtime profiles, runtime overrides, and project indexes.
- Godot-backed validation with isolated workspace-local log/data/cache paths.
- JSON output suitable for future Godot editor integration.
- Interactive Codex/OpenCode-style terminal shell with slash commands, mode switching, command-palette help, aliases, and status hints for implemented workflows.
- Menu-first setup, settings, model, auth, and runtime flows for TTY sessions.
- Greenfield scaffolding for `project.godot`, `scenes/main.tscn`, and `scripts/main.gd`.
- Deterministic planning artifact generation for brief, GDD, technical plan, tasks, decisions, and risk log.
- Harness-generated backlog and durable run records under `.godotcoder/runs/`.
- Deterministic first playable builder for a single-scene 2D asteroid shooter prototype.
- Deterministic first playable builder for a single-scene 2D platformer prototype.
- Prompt-based deterministic builder selection for supported prototype genres.
- Build preview mode before applying generated files.
- Compact line diffs in build previews, including unchanged-file detection.
- Interactive pending build approval with `/apply` and `/reject`.
- Applied build change records under `.godotcoder/patches/<id>/record.json` with file operations, unchanged-file detection, and hashes.

Note: in a greenfield folder, preview may create the minimal Godot scaffold first so there is a valid project context. It does not apply the larger build changes or write patch records until `--apply`.

## Local Runtime Finding

This machine did not expose a Godot Flatpak app through:

```bash
flatpak list --app --columns=application,name,branch
```

A native `godot` command was detected:

```text
4.6.2.stable.fedora.71f334935
```

The runtime adapter records this as `installType: "native"`. Native Godot and Flatpak should both be treated as first-class Linux runtime targets.

Runtime selection can be pinned per machine:

```bash
node dist/cli.js runtime use godot
node dist/cli.js runtime use flatpak run org.godotengine.Godot
```

The pinned command is written to `.godotcoder.local/runtime-overrides.json` and used by both `runtime doctor` and `validate`.

## Verification

Commands run:

```bash
npm run check
npm run build
```

Both passed.

A temporary Godot project under `/tmp/godotcoder-smoke` verified:

```bash
node dist/cli.js init --json
node dist/cli.js inspect --json
node dist/cli.js runtime doctor --json
node dist/cli.js validate --json
node dist/cli.js status --json
```

Validation initially caught a real missing autoload script. After adding the missing script, `validate` returned:

```json
{
  "ok": true,
  "summary": {
    "errors": 0,
    "warnings": 0
  }
}
```

A greenfield flow under `/tmp/godotcoder-greenfield` verified:

```bash
printf '/mode plan\nmake a 2d asteroid shooter\n/check\n/inspect\n/exit\n' | node dist/cli.js
```

This created a minimal Godot project, wrote planning artifacts, validated with zero errors, and inspected the new project.

A greenfield build flow under `/tmp/godotcoder-build-smoke` verified:

```bash
printf '/mode plan\nmake a 2d asteroid shooter\n/mode build\nbuild the first playable\n/apply\n/inspect\n/exit\n' | node dist/cli.js
```

This created a minimal Godot project, built a playable single-scene 2D asteroid shooter prototype, ran Godot validation with zero errors, and inspected the resulting project.

A platformer build flow under `/tmp/godotcoder-platformer-smoke` verified:

```bash
node dist/cli.js build "build a 2d platformer with coins" --apply --json
```

This built a playable single-scene 2D platformer prototype and ran Godot validation with zero errors.

A directed harness flow under `/tmp/godotcoder-harness-smoke` verified:

```bash
node dist/cli.js harness "make a 2d platformer with coins" --json
node dist/cli.js harness "make a 2d platformer with coins" --apply --json
```

This created agent roster, backlog, planning artifacts, run records, patch record, and Godot validation report with zero errors.

Model provider flow verified without requiring live credentials:

```bash
node dist/cli.js models --json
node dist/cli.js models use --provider ollama --model llama3.1 --json
node dist/cli.js harness "make a 2d asteroid shooter" --llm --json
```

With Ollama not running, harness records model advisory failure and continues deterministic preview instead of crashing.

Settings/auth flow verified:

```bash
node dist/cli.js setup
node dist/cli.js settings --json
node dist/cli.js settings
node dist/cli.js settings set defaultMode plan --json
node dist/cli.js settings default-mode build --json
node dist/cli.js settings provider ollama --json
node dist/cli.js auth login --provider openai --api-key test-key-123456 --json
node dist/cli.js auth --json
```

Auth status redacts stored key and reports active model provider.

## Next Slice

Recommended next implementation slice:

1. Improve `project.godot` parsing for nested sections and typed values.
2. Promote provider/model layer from advisory output to controlled agent task execution.
3. Add official Godot docs source interface.
4. Add schema guards for change records and validation reports.
