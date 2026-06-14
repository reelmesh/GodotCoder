# Implementation Status

Date: 2026-06-13

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
- `godotcoder repair`
- `godotcoder plan <idea>`
- `godotcoder build <task>`
- `godotcoder pipeline <game idea>`
- `godotcoder play`
- `godotcoder runs`
- `godotcoder menu`

Core modules:
- Godot 4.3+ runtime policy; Godot 4.2 and older are unsupported.
- Workspace path management.
- Godot-specific agent roster with ownership boundaries and gates.
- Directed harness runner with orchestrator, scout, producer, designer, architect, gameplay engineer, QA validator, and docs librarian phases.
- Provider layer for OpenAI-compatible APIs, OpenAI API, Anthropic API, Ollama, and LM Studio.
- Provider policy: GodotCoder uses the configured API/model exactly as provided; it does not load, download, unload, or manage local model lifecycle.
- LM Studio provider defaults to `http://10.0.0.9:1234` and uses native local API endpoints: `GET /api/v1/models` and `POST /api/v1/chat`.
- Model config in `.godotcoder.local/model-config.json`.
- User settings in `.godotcoder.local/user-settings.json`.
- Interactive menu-first settings UI in TTY sessions.
- Bracketed `[*]` menu selection with arrow-key navigation and `space`/`enter` accept.
- Nested menu text prompts keep one active readline owner so typed characters are not echoed twice.
- Local provider secrets in `.godotcoder.local/secrets.json`, with redacted auth status.
- LM Studio bearer token support through `LM_API_TOKEN` or `auth login --provider lmstudio`.
- LM Studio base URLs accept either full URLs or bare `host:port` values, normalizing bare values to `http://host:port`.
- Advisory LLM calls through `ask`.
- Controlled LLM implementation through `build --llm`, `harness --llm`, and `pipeline --llm`.
- Failed controlled harness/pipeline model attempts are recorded under `.godotcoder/model-failures/` with parse error, provider/model, and truncated raw model output for debugging.
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
- Internal deterministic bootstrap fallbacks for a single-scene 2D asteroid shooter prototype and a single-scene 2D platformer prototype.
- Open-ended game synthesis remains LLM-driven; deterministic fallbacks are for bootstrap and validation only.
- `godotcoder build --llm` controlled model generation path that asks the configured provider for full Godot file contents, validates paths/extensions, previews diffs, applies only with approval, writes patch records, and runs Godot validation.
- `harness --llm` and `pipeline --llm` promote configured model output into the directed agent implementation step, preserving JSON parsing, path/extension validation, preview/apply gates, patch records, and Godot validation.
- Build preview mode before applying generated files.
- Compact line diffs in build previews, including unchanged-file detection.
- Interactive pending build approval with `/apply` and `/reject`.
- Applied build change records under `.godotcoder/patches/<id>/record.json` with file operations, unchanged-file detection, and hashes.
- End-to-end pipeline command that creates greenfield projects, writes planning artifacts, runs the directed harness, applies a first playable, validates with Godot, and records the run.
- `--preview`, `--llm`, `--play`, `--json`, `--no-validate`, and `--no-repair` pipeline flags.
- Godot launch helper for running the current game or opening the editor through the configured runtime.
- Home menu and run-history browser for the main CLI workflow.
- Slash command completion and menu type-to-jump support.
- Bounded deterministic repair loop after failed pipeline validation.
- Standalone repair command for validating, repairing, recording, and revalidating an existing Godot project.
- Repair records under `.godotcoder/repairs/<repair-id>.json`.
- Missing `res://...gd` script repair rule that creates a minimal placeholder script, writes a repair patch record, and re-runs Godot validation.
- Godot 3 to Godot 4 GDScript migration repair rule for `export var`, `Pool*Array`, `OS.get_ticks_*`, `deg2rad`, `rad2deg`, `linear2db`, `db2linear`, `instance()`, and simple `yield(owner, "signal")` calls.
- Millisecond artifact IDs for run, patch, validation, and repair records to avoid collisions during fast pipeline loops.

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
GodotCoder requires Godot 4.3 or newer. Runtime profiles record `minimumGodotVersion: "4.3.0"` and whether the detected runtime is supported.

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

An end-to-end pipeline preview under `/tmp/godotcoder-pipeline-smoke` verified:

```bash
node dist/cli.js pipeline "make a 2d asteroid shooter" --preview --json
```

This created a greenfield Godot scaffold, planning artifacts, agent roster, backlog, runtime profile, and harness run record without applying the full prototype.

An end-to-end pipeline apply under `/tmp/godotcoder-pipeline-apply-smoke` verified:

```bash
node dist/cli.js pipeline "make a 2d platformer with coins" --json
```

This created a greenfield Godot project, built a playable single-scene platformer, wrote patch/run/validation records, and Godot validation returned zero errors and zero warnings.

A repair-loop pipeline under `/tmp/godotcoder-repair-smoke` verified:

```bash
node dist/cli.js pipeline "make a 2d asteroid shooter" --json
```

The project intentionally referenced a missing autoload script at `res://scripts/missing_service.gd`. Initial Godot validation reported three errors. The repair loop created a placeholder script, wrote a repair record and patch record, re-ran Godot validation, and finished with zero errors and zero warnings.

A Godot 4 migration repair under `/tmp/godotcoder-migration-smoke` verified:

```bash
node dist/cli.js pipeline "make a 2d platformer with coins" --json
```

The project intentionally had an autoload script using Godot 3 syntax and APIs: `export var`, `PoolVector2Array`, `OS.get_ticks_msec`, and `deg2rad`. Initial validation failed with parse/load errors. The repair loop migrated the script to Godot 4 equivalents and post-repair validation returned zero errors and zero warnings.

A standalone repair command under `/tmp/godotcoder-repair-command-smoke` verified:

```bash
node dist/cli.js repair --json
```

The project intentionally had an autoload script using Godot 3 syntax and APIs: `export var`, `PoolVector2Array`, and `OS.get_ticks_msec`. Initial validation reported three errors. The standalone repair command migrated the script to Godot 4 equivalents, wrote a repair record, and post-repair validation returned zero errors and zero warnings.

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

Controlled LLM build path verified without live model credentials:

```bash
node dist/cli.js build "make original puzzle game" --llm --preview --json
node dist/cli.js auth login --provider lmstudio --api-key test-token --json
node dist/cli.js models use --provider lmstudio --model local-model --base-url 10.0.0.9:1234 --json
```

With no model provider configured, `build --llm` exits with `MODEL_CONFIG_MISSING`. LM Studio auth accepts local bearer tokens and `models use --provider lmstudio` records `apiKeyEnv: "LM_API_TOKEN"`.

Controlled LLM build path verified with live LM Studio:

```bash
node dist/cli.js models use --provider lmstudio --model qwen/qwen3.6-27b --json
node dist/cli.js ask "Say hello in one sentence" --json
node dist/cli.js build "change scripts/main.gd to print a custom puzzle-game ready message" --llm --preview --json
```

LM Studio chat uses typed `input` blocks, returns `output` arrays, and can include reasoning items. The provider parser extracts message content and ignores reasoning for controlled JSON parsing.

Real LM Studio testing with `qwen/qwen3.6-27b` verified:

```bash
node dist/cli.js models use --provider lmstudio --model qwen/qwen3.6-27b --base-url 10.0.0.9:1234 --json
node dist/cli.js build "change scripts/main.gd to print a custom puzzle-game ready message" --llm --preview --json
node dist/cli.js build "change scripts/main.gd to print a custom puzzle-game ready message" --llm --apply --json
```

The small controlled build path generated model output, wrote `res://scripts/main.gd`, created a patch record, and Godot validation returned zero errors and zero warnings. Larger `pipeline --llm --preview` requests against the same model still fell back to the deterministic builder because the model did not return valid JSON for the full game request. The parser now accepts either `contents` strings or `lines` arrays, retries once with a stricter JSON-only prompt, repairs common loose JSON shape errors, and records failed attempt artifacts before falling back.

Controlled LLM harness/pipeline path verified with an LM Studio-compatible local server:

```bash
node dist/cli.js models use --provider lmstudio --model mock-godot --base-url http://127.0.0.1:18082 --json
node dist/cli.js pipeline "make a custom cozy puzzle game" --preview --llm --json
node dist/cli.js pipeline "make a custom cozy puzzle game" --llm --no-validate --json
```

The preview run recorded `model-implementation` as done, `implementationSource: "llm"`, and the preview diff came from the model-generated Godot file. The apply run wrote the model-generated file and patch record with `source: llm`. With no provider configured, `pipeline --llm --preview` records `model-implementation` as skipped and falls back to the deterministic bootstrap builder.

## Next Slice

Recommended next implementation slice:

1. Expand open-ended game synthesis quality with stronger agent prompts and acceptance gates.
2. Add official Godot docs source interface.
3. Expand repair rules for missing resources, scene load failures, signal connection changes, and more Godot 4 API migrations.
4. Improve `project.godot` parsing for nested sections and typed values.
