# Implementation Status

Date: 2026-06-18

## Recent Implementation Arc: Validation, Brownfield Safety, Export Readiness

Implemented and verified the next confidence-building arc:

- `godotcoder validate --visual`
  - Launches the project through the configured Godot runtime with a temporary capture script.
  - Saves artifacts under `.godotcoder/validations/<validation-id>/`, including `frame.png`.
  - Adds `visual` to validation JSON with artifact path, dimensions, blank/near-blank status, and visual findings.
  - Treats blank or near-blank frames as warnings by default, escalating to errors only when runtime errors are also present.
  - Includes PNG analysis coverage for blank/nonblank frames and missing screenshot artifacts.
- Brownfield project safety
  - Adds brownfield detection beyond the minimal GodotCoder scaffold.
  - Adds task intent modes: `feature`, `fix`, `refactor`, and `polish`.
  - Adds model prompt guidance to preserve architecture, naming, scene ownership, input actions, autoloads, resources, and paths in brownfield projects.
  - Adds apply-time safety checks that reject broad unrelated rewrites, large existing script replacement, large `project.godot` rewrites, deletion-like edits, and non-Godot-native generated content.
  - Brownfield pipeline/harness runs default to preview unless `--apply` is passed explicitly.
  - Build, harness, and pipeline JSON include brownfield and task-intent metadata.
- Export preset automation
  - Adds `godotcoder export doctor [--json]`.
  - Adds `godotcoder export preset linux [--apply] [--json]`.
  - `export doctor` inspects `export_presets.cfg`, configured presets, platform names, output paths, likely template installation locations, and readiness findings without running an export build.
  - `export preset linux` is preview-first and prints the exact starter Linux preset text before writing; it only writes `export_presets.cfg` with `--apply`.
  - `status` now surfaces export readiness and preset count.
  - `validate --export` reports include `exportReadiness` so future build/repair prompts can reference export facts.

Verification for this arc:

```bash
npm run check
npm run build
npm run test:smoke
```

All passed. The smoke suite now covers brownfield detection/safety, export doctor/preset automation, visual validation frame analysis, existing parser/repair/schema tests, and RPC/provider smoke coverage.

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
- `godotcoder validate --smoke` for headless main-scene runtime checks (timing out after 3000ms by default).
- `godotcoder validate --visual` for main-scene frame capture and blank/near-blank visual checks.
- `godotcoder validate --export` for headless export pack checking (parsing export_presets.cfg and verifying PCK packing).
- `godotcoder export doctor` for non-build export readiness inspection.
- `godotcoder export preset linux` for preview-first starter Linux export preset generation.
- `godotcoder repair`
- `godotcoder plan <idea>`
- `godotcoder build <task>`
- `godotcoder pipeline <game idea>`
- `godotcoder play`
- `godotcoder runs`
- `godotcoder menu`
- `godotcoder rpc <method>`
- Minimal Godot editor plugin scaffold under `addons/godotcoder/` that shells out to `godotcoder rpc`.
- Editor plugin captures scene, selection, script, and open-scene context, auto-attaches context to regular RPC calls, supports replay/selected replay/clear controls, persists recent RPC history under `user://godotcoder/plugin-history.json`, and surfaces separate stdout/stderr/exit-state output for RPC runs.
- Editor plugin exposes `Debug` for captured or pasted console/error text through `godotcoder rpc debug.current`.
- Editor plugin debugger integration captures runtime errors (`debug:error`) and warnings (`debug:warning`) automatically from active game execution, populating the error panel.
- Editor plugin exposes preview-only build review through `godotcoder rpc build.preview`, including compact file counts and changed paths.
- Editor plugin exposes `Explain` for selected scene/node/script context through `godotcoder rpc editor.explain`.
- Editor plugin exposes `Review` for read-only git workspace summaries through `godotcoder rpc workspace.changes`.
- Editor plugin exposes `Scene` for current-scene prechecks through `godotcoder rpc validation.scene`.
- `docs/EDITOR_PLUGIN_TEST_PLAN.md` records the plugin round-trip acceptance checks.

Core modules:
- Godot 4.3+ runtime policy; Godot 4.2 and older are unsupported.
- Workspace path management.
- Godot-specific agent roster with ownership boundaries and gates.
- Directed harness runner with orchestrator, scout, producer, designer, architect, gameplay engineer, QA validator, and docs librarian phases.
- Provider layer for OpenAI-compatible APIs, OpenAI API, Anthropic API, Ollama, and LM Studio.
- Provider policy: GodotCoder uses the configured API/model exactly as provided; it does not load, download, unload, or manage local model lifecycle.
- Official Godot docs source interface with `docs search`, `docs list`, `docs cache <doc-id>`, and `docs show <doc-id>`.
- Official Godot docs cache writes raw HTML, extracted text, metadata, and short excerpts for retrieval beyond source summaries.
- LM Studio provider defaults to `http://127.0.0.1:1234` and uses native local API endpoints: `GET /api/v1/models` and `POST /api/v1/chat`.
- Model config in `.godotcoder.local/model-config.json`.
- User settings in `.godotcoder.local/user-settings.json`.
- Interactive menu-first settings UI in TTY sessions.
- Bracketed `[*]` menu selection with arrow-key navigation and `space`/`enter` accept.
- Nested menu text prompts keep one active readline owner so typed characters are not echoed twice.
- Local provider secrets in `.godotcoder.local/secrets.json`, with redacted auth status.
- LM Studio bearer token support through `LM_API_TOKEN` or `auth login --provider lmstudio`.
- LM Studio base URLs accept either full URLs or bare `host:port` values, normalizing bare values to `http://host:port`.
- Advisory LLM calls through `ask`.
- Controlled LLM implementation through `build`, `harness`, and `pipeline`.
- Failed controlled harness/pipeline model attempts are recorded under `.godotcoder/model-failures/` with parse error, provider/model, and truncated raw model output for debugging.
- Godot project root discovery.
- Typed `project.godot` parsing for strings, numbers, booleans, dictionaries, `PackedStringArray`, slash keys, feature tags, main scene, app name, renderer, display settings, input map, autoloads, and enabled editor plugins.
- Project index generation.
- Export preset extraction from `export_presets.cfg` when present.
- Runtime discovery for Flatpak and native Godot binaries.
- Local runtime overrides in `.godotcoder.local/runtime-overrides.json` for native, Flatpak, and custom Godot commands.
- Runtime profiles enriched with Godot project config version, feature tags, main scene, autoloads, plugins, and export preset signals.
- Lightweight schema guards for runtime profiles, runtime overrides, and project indexes.
- Godot-backed validation with isolated workspace-local log/data/cache paths.
- Visual validation frame capture, PNG analysis, and structured visual validation findings.
- Export readiness inspection for preset files, preset metadata, output paths, and likely export template availability.
- JSON output suitable for future Godot editor integration.
- Interactive Codex/OpenCode-style terminal shell with slash commands, mode switching, command-palette help, aliases, and status hints for implemented workflows.
- Menu-first setup, settings, model, auth, and runtime flows for TTY sessions.
- Greenfield scaffolding for `project.godot`, `scenes/main.tscn`, and `scripts/main.gd`.
- Deterministic planning artifact generation for brief, GDD, technical plan, tasks, decisions, and risk log.
- Harness-generated backlog and durable run records under `.godotcoder/runs/`.
- Harness-generated docs context under `.godotcoder/cache/docs/context.json`, with official Godot docs URLs and summaries selected by run goal.
- Internal deterministic bootstrap fallbacks for a single-scene 2D asteroid shooter prototype and a single-scene 2D platformer prototype.
- Open-ended game synthesis remains LLM-driven; deterministic fallbacks are for bootstrap and validation only.
- `godotcoder build` controlled model generation path that asks the configured provider for full Godot file contents, validates paths/extensions, previews diffs, applies only with approval, writes patch records, and runs Godot validation.
- `harness` and `pipeline` promote configured model output into the directed agent implementation step, preserving JSON parsing, path/extension validation, preview/apply gates, patch records, and Godot validation.
- Open-ended LLM game synthesis prompts require a first playable vertical slice with scene/script presence, input or frame processing, visible feedback, an objective/fail/restart loop, and Godot 4.3+ API syntax.
- Brownfield LLM build prompts require preservation of existing architecture, scene ownership, naming, input actions, autoloads, resources, and paths.
- Brownfield safety rejects broad rewrites, large existing script replacement, large `project.godot` rewrites, deletion-like edits, and non-Godot-native generated content unless the task explicitly asks for a rewrite.
- Task intent modes are supported through `--intent feature|fix|refactor|polish` and aliases `--feature`, `--fix`, `--refactor`, `--polish`.
- Repeatable Node smoke test suite for project config mutation, deterministic repair, docs cache enrichment, open-ended game acceptance gates, and mock provider e2e flows.
- Mock OpenAI-compatible provider e2e coverage for `models use`, `ask`, `build --preview` retry parsing, and harness fallback/model-failure artifacts.
- RPC-style JSON command for editor integration prep: `workspace.status`, `workspace.changes`, `project.inspect`, `runtime.doctor`, `validation.run`, `validation.scene`, `docs.search`, `build.preview`, `debug.current`, `editor.context`, and `editor.explain`.
- `build.preview` RPC returns both raw preview data and a compact `previewSummary` for editor clients.
- Stable RPC envelope shape: `{ ok, method, result, error, diagnostics }`.
- Build preview mode before applying generated files.
- Compact line diffs in build previews, including unchanged-file detection.
- Interactive pending build approval with `/apply` and `/reject`.
- Applied build change records under `.godotcoder/patches/<id>/record.json` with file operations, unchanged-file detection, and hashes.
- End-to-end pipeline command that creates greenfield projects, writes planning artifacts, runs the directed harness, applies a first playable, validates with Godot, and records the run.
- `--preview`, `--llm`, `--play`, `--json`, `--no-validate`, and `--no-repair` pipeline flags.
- Brownfield pipeline/harness apply mode requires explicit `--apply`; otherwise the run records a preview gate and avoids applying generated edits.
- Godot launch helper for running the current game or opening the editor through the configured runtime.
- Home menu and run-history browser for the main CLI workflow.
- Slash command completion and menu type-to-jump support.
- Bounded deterministic repair loop after failed pipeline validation.
- Standalone repair command for validating, repairing, recording, and revalidating an existing Godot project.
- Repair records under `.godotcoder/repairs/<repair-id>.json`.
- Missing `res://...gd` script repair rule that creates a minimal placeholder script, writes a repair patch record, and re-runs Godot validation.
- Missing `res://...tscn` scene and `res://...tres` resource repair rules that create minimal placeholders, write repair patch records, and re-run Godot validation.
- Godot 3 to Godot 4 GDScript migration repair rule for `export var`, `Pool*Array`, `OS.get_ticks_*`, `deg2rad`, `rad2deg`, `linear2db`, `db2linear`, `instance()`, and simple `yield(owner, "signal")` calls.
- Expanded Godot 4 migration repair rules for `tool`, `onready var`, `KinematicBody2D`, `KinematicBody3D`, `Navigation2D`, `Navigation3D`, and simple `connect("signal", target, "method")` calls.
- Millisecond artifact IDs for run, patch, validation, and repair records to avoid collisions during fast pipeline loops.
- Safe `project.godot` mutation helpers for project settings and input-map actions, preserving existing sections where possible and appending missing sections/keys.

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

## Adversarial Code Review (2026-06-16)

Full codebase review found 22 issues. Fixes applied in commit `0bdf9d0`:

- **LM Studio default URL** changed from `http://10.0.0.9:1234` to `http://127.0.0.1:1234` — old default unreachable for most users.
- **`cacheGodotDoc` fetch timeout**: added 30-second `AbortController` timeout. Previously hung indefinitely on slow/unreachable docs server.
- **Godot 4 `tool` migration regex**: added negative lookbehind `(?<!# )` to skip comment lines containing only `tool`. Previously `# tool` became `# @tool`.
- **`/doctor` session command**: wrapped in try/catch so it doesn't crash when run outside a Godot project.
- **Harness repair null guard**: `options.repair && validation && validation.summary.errors > 0` — prevents TypeError when `--no-validate` + `--repair` combined.
- **`escapeGodotString` in `greenfield.ts`**: added `\n` and `\t` escapes for parity with `godot-project.ts` full implementation.
- **Deduplicated `timestampId`**: extracted from 4 duplicate definitions into shared `src/core/ids.ts`.

### Review Findings Logged (not yet addressed)

All findings from the first review are now addressed.

### Second Review: New Feature Hardening (2026-06-16)

Review of smoke validation, export validation, LLM parser hardening, and settings additions (commit `b093965`) found 11 issues. All fixed in commit `0e83a31`:

- **Temp file race condition** in export validation: filenames now include loop index.
- **Fragile timeout detection** in smoke validation replaced with explicit `ProcessResult.timedOut` field.
- **Redundant dynamic import** in settings removed; uses static `stat` import now.
- **Missing `--log-file`** added to smoke validation command.
- **`readFile` error handling** in export validation: distinguishes `ENOENT` from permission errors.
- **`parseGodotOutput` multi-line loss**: all continuation lines captured, not just `res://` paths.
- **Sequential doc reads** parallelized with `Promise.all`.
- **`<thinking>` tag stripping** added to JSON extraction alongside `<think>`.
- **Trailing blank lines** removed from commands and core modules.
- **Test temp dir cleanup** added to smoke/export/hardening tests.

## Verification

Build after review fixes:

```bash
npm run check  # clean
npm run build
npm run test:smoke
```

All passed.

Commands run:

```bash
npm run check
npm run build
npm run test:smoke
```

All passed.

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
node dist/cli.js harness "make a 2d asteroid shooter" --json
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
node dist/cli.js build "make original puzzle game" --preview --json
node dist/cli.js auth login --provider lmstudio --api-key test-token --json
node dist/cli.js models use --provider lmstudio --model local-model --base-url 10.0.0.9:1234 --json
```

With no model provider configured, `build` exits with `MODEL_CONFIG_MISSING`. LM Studio auth accepts local bearer tokens and `models use --provider lmstudio` records `apiKeyEnv: "LM_API_TOKEN"`.

Controlled LLM build path verified with live LM Studio:

```bash
node dist/cli.js models use --provider lmstudio --model qwen/qwen3.6-27b --json
node dist/cli.js ask "Say hello in one sentence" --json
node dist/cli.js build "change scripts/main.gd to print a custom puzzle-game ready message" --preview --json
```

LM Studio chat uses typed `input` blocks, returns `output` arrays, and can include reasoning items. The provider parser extracts message content and ignores reasoning for controlled JSON parsing.

Real LM Studio testing with `qwen/qwen3.6-27b` verified:

```bash
node dist/cli.js models use --provider lmstudio --model qwen/qwen3.6-27b --base-url 10.0.0.9:1234 --json
node dist/cli.js build "change scripts/main.gd to print a custom puzzle-game ready message" --preview --json
node dist/cli.js build "change scripts/main.gd to print a custom puzzle-game ready message" --apply --json
```

The small controlled build path generated model output, wrote `res://scripts/main.gd`, created a patch record, and Godot validation returned zero errors and zero warnings. Larger `pipeline --preview` requests against the same model still fell back to the deterministic builder because the model did not return valid JSON for the full game request. The parser now accepts either `contents` strings or `lines` arrays, retries once with a stricter JSON-only prompt, repairs common loose JSON shape errors, and records failed attempt artifacts before falling back.

Controlled LLM harness/pipeline path verified with an LM Studio-compatible local server:

```bash
node dist/cli.js models use --provider lmstudio --model mock-godot --base-url http://127.0.0.1:18082 --json
node dist/cli.js pipeline "make a custom cozy puzzle game" --preview --json
node dist/cli.js pipeline "make a custom cozy puzzle game" --no-validate --json
```

The preview run recorded `model-implementation` as done, `implementationSource: "llm"`, and the preview diff came from the model-generated Godot file. The apply run wrote the model-generated file and patch record with `source: llm`. With no provider configured, `pipeline --preview` records `model-implementation` as skipped and falls back to the deterministic bootstrap builder.

## Next Slice (Completed & Updated)

The previous slices have been fully implemented:
- [x] **Slice 1**: Expanded open-ended game synthesis quality with stronger agent prompts, strict system guidelines, and an automated `# TODO` / `pass #` validation gate.
- [x] **Slice-2**: Expanded official Godot documentation retrieval by extracting, cleaning, and embedding full cached HTML pages as markdown snippets in the prompt context.
- [x] **Slice 3**: Expanded deterministic repair rules for generating missing scenes (`.tscn`), resources (`.tres`), and images (`.svg`), along with detailed GDScript migration rules (`@onready`, `@export_range`, `@export_file`, `randf_range`, and Callable signal connections).
- [x] **Slice 4**: Added `project.godot` mutation and serialization helpers to safely update input maps, autoloads, and configurations.
- [x] **Custom Workflows**: Added `/workflow` (or `godotcoder workflow`) command and a workspace skill to initialize and customize templates.
- [x] **Godot Editor Plugin Integration**: Created a valid Godot Editor Plugin in `addons/godotcoder/` and successfully enabled it.
- [x] **Automated Runtime Playtesting**: Implemented a dry-run playtesting tool (`godotcoder playtest` or `play --test`) that plays the generated game headlessly for 5 seconds with random input simulation.
- [x] **Interactive Repair UX**: Developed `repair list`, `repair diff`, and `repair undo/revert` commands to view history/diffs and safely restore original file states.
- [x] **Structured JSON Output Enhancements**: Incorporated newline string repair prior to JSON parsing.

Project config mutation helpers verified:

```bash
npm run check
npm run build
node --input-type=module -e 'import { updateGodotConfigText, parseGodotConfig } from "./dist/core/godot-project.js"; const source = `config_version=5\n\n[application]\nconfig/name="Old"\n`; const next = updateGodotConfigText(source, [{ section: "application", key: "config/name", value: "New" }, { section: "input", key: "jump", value: { deadzone: 0.5, events: [] } }]); const parsed = parseGodotConfig(next); if (parsed.application.config_name !== "New") throw new Error("name not updated"); const jump = parsed.input.jump; if (!jump || typeof jump !== "object" || Array.isArray(jump)) throw new Error("input action missing"); if (!Array.isArray(jump.events)) throw new Error("events not parsed as array"); console.log("smoke ok");'
```

Expanded deterministic repair rules verified:

```bash
npm run check
npm run build
```

Additional smoke coverage exercised the repair entrypoint with fake validation reports to confirm missing `.tscn` and `.tres` placeholders are created, and Godot 3 script syntax is migrated for `tool`, `onready var`, `KinematicBody2D`, and simple signal `connect(...)` calls.

Official docs retrieval beyond metadata verified:

```bash
npm run check
npm run build
```

Additional smoke coverage exercised HTML-to-text extraction, cached doc metadata loading, and docs context enrichment with cached excerpts.

Open-ended game synthesis acceptance gates verified:

```bash
npm run check
npm run build
```

Additional smoke coverage confirmed weak open-ended game output is rejected for missing scene/input gates, valid playable output passes, and small edit prompts bypass game-synthesis gates.

Automated smoke suite verified:

```bash
npm run test:smoke
```

The suite covers the project config mutation helper, missing scene/resource repair, Godot 3 migration repair, docs cache/context enrichment, open-ended game acceptance gates, OpenAI-compatible mock provider calls, LLM build retry parsing, model-failure fallback records, and RPC success/error envelopes.

## Next Slice

Recommended next: editor plugin review/apply UX.

The visual validation, brownfield safety, and Linux export preset automation slices are complete. The next useful product slice is to keep the Godot editor plugin thin while adding:

- clearer pending-build summaries,
- Apply and Reject buttons that call the CLI/RPC path,
- latest validation/repair/visual summaries in the dock,
- a quick `Debug last runtime error` action using `debug.current`.

## Third Review: Architecture Hardening (2026-06-16)

Full codebase review of 36 source files (~5,500 lines). Found 9 issues. All fixed:

- **LM Studio default URL**: commands/models.ts used `10.0.0.9` while core/providers.ts used `127.0.0.1`. Unified to `127.0.0.1`.
- **Hardcoded path**: workflow.ts template contained absolute `/home/carlosm/...` path. Replaced with relative `.godotcoder/`.
- **Smoke validation**: Added `--quit-after` flag so Godot self-terminates (defense-in-depth on top of Node timeout kill).
- **Repair regex**: Added `.webp`, `.gdshader`, `.import`, `.material`, `.shader` to missing resource path detection.
- **Shared utils**: Extracted `readFlag`, `parseProvider`, `defaultBaseUrl`, `defaultApiKeyEnv` into `src/core/flags.ts`. Removed 4 duplicate implementations across commands/auth/models/setup/rpc.
- **Command registry**: Created `src/core/session-commands.ts` as single source of truth for all 29 slash commands with aliases, flags, and descriptions. `completion.ts` now derives command names and flag completion from registry instead of hardcoded maps.
- **Split godot-project.ts**: Separated 555-line monolith into `godot-config-parser.ts` (INI parser/serializer), `godot-project-indexer.ts` (discovery/walk/inspect), and `godot-setting-editor.ts` (safe mutation). Original file is now a 30-line barrel.
- **TypeScript strictness**: Enabled `noUnusedLocals` and `noUnusedParameters` in tsconfig.json. Removed 5 dead declarations (unused imports, dead functions, dead variables).
- **Tests added**: 55 unit tests across 3 suites (schema validators, config parser, Godot 3→4 migration). The current smoke suite has since grown to 63 tests covering brownfield, export, and visual validation additions.

Build verification:

```bash
npm run check  # clean, no unused locals
npm run build
npm run test:smoke  # 63 tests, 0 failures
```
