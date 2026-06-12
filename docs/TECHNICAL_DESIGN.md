# GodotCoder Technical Design

Date: 2026-06-11

## 1. Purpose

This document turns the PRD decisions into an implementation shape for the first GodotCoder build.

Accepted direction:
- CLI-first application.
- TypeScript/Node implementation.
- Pi-inspired provider/orchestration layer.
- Godot 4.x target.
- Linux-first, with native Godot and Flatpak support first.
- Official Godot docs as the primary trusted knowledge source.
- Godot executable as the primary validator.
- Subprocess JSON as the first Godot editor integration protocol.
- Generated game code stays Godot-native and GDScript-first.

## 2. High-Level Architecture

```text
godotcoder CLI
  commands/
    init
    settings
    auth
    status
    runtime doctor
    inspect
    validate
    agents
    models
    ask
    harness
    plan
    build
  core/
    workspace
    project inspector
    runtime adapter
    validation harness
    patch manager
    knowledge sources
    agent orchestrator
  providers/
    Pi-style model/provider abstraction
  protocol/
    subprocess JSON envelopes

Godot Editor Integration
  thin plugin/local adapter
  gathers editor context
  calls godotcoder subprocess JSON
  displays responses
  triggers validation/debug workflows
```

The CLI owns orchestration, providers, memory, artifacts, approvals, validation, and patch state. The Godot editor integration should remain thin.

## 3. First Command Surface

### `godotcoder init`

Creates a `.godotcoder/` workspace in the current Godot project.

Responsibilities:
- Find `project.godot`.
- Create workspace folders and initial artifacts.
- Create `runtime-profile.json`.
- Create a recommended `.gitignore` snippet or print one.

### `godotcoder`

Starts the default interactive terminal agent session.

Responsibilities:
- Present a Codex/OpenCode-style prompt.
- Accept slash commands for implemented workflows.
- Accept natural-language prompts for model-backed workflows once the provider layer is wired.
- Keep subcommands available for scripting and editor integration.

Initial slash commands:
- `/settings`
- `/auth`
- `/agents`
- `/models`
- `/ask <prompt>`
- `/harness <goal>`
- `/status`
- `/runtime doctor`
- `/inspect`
- `/validate`
- `/plan <idea>`
- `/build <task>`
- `/exit`

### `godotcoder status`

Summarizes workspace and project state.

Responsibilities:
- Report workspace root.
- Report Godot project root.
- Report known runtime profile.
- Report whether planning artifacts exist.
- Report latest validation result.
- Report dirty/missing workspace artifacts.

### `godotcoder settings`

Shows local user settings.

Responsibilities:
- Open an interactive menu in TTY sessions.
- Load `.godotcoder.local/user-settings.json`.
- Report default mode, approval mode, preferred provider, and diff display policy.
- Keep machine-specific preferences out of git.

### `godotcoder settings set <key> <value>`

Writes one local setting.

Supported keys:
- `defaultMode`: `plan` or `build`
- `approvalMode`: `preview` or `auto-apply`
- `preferredProvider`: `openai`, `anthropic`, `ollama`, `lmstudio`, or `openai-compatible`
- `showDiffs`: `compact` or `full`

Friendly aliases:
- `godotcoder settings default-mode plan|build`
- `godotcoder settings approval-mode preview|auto-apply`
- `godotcoder settings provider <provider>`
- `godotcoder settings diffs compact|full`

### `godotcoder auth`

Shows local auth status.

Responsibilities:
- Load `.godotcoder.local/secrets.json`.
- Report configured providers with redacted keys.
- Report active model provider.

### `godotcoder auth login`

Stores local provider secret.

Responsibilities:
- Support API-key providers: OpenAI, Anthropic, OpenAI-compatible APIs.
- Store secrets under `.godotcoder.local/secrets.json`.
- Prefer environment variables when both env and local secret exist.

### `godotcoder auth logout`

Removes local provider secret.

### `godotcoder agents`

Prints GodotCoder agent roster.

Responsibilities:
- List Godot-specific agents and ownership boundaries.
- Expose machine-readable roster for editor integration.
- Make roles explicit before provider-backed execution exists.

### `godotcoder models`

Inspects configured model provider.

Responsibilities:
- Load `.godotcoder.local/model-config.json` or environment variables.
- Support OpenAI-compatible APIs, OpenAI API, Anthropic API, Ollama, and LM Studio.
- List models where provider exposes model listing.
- Report missing API keys or unreachable local servers without touching game files.

### `godotcoder models use`

Writes local model configuration.

Examples:

```bash
godotcoder models use --provider ollama --model llama3.1
godotcoder models use --provider lmstudio --model local-model
godotcoder models use --provider openai --model your-model --api-key-env OPENAI_API_KEY
godotcoder models use --provider anthropic --model your-model --api-key-env ANTHROPIC_API_KEY
godotcoder models use --provider openai-compatible --model your-model --base-url https://example.com/v1 --api-key-env YOUR_API_KEY_ENV
```

### `godotcoder ask <prompt>`

Runs one model prompt with GodotCoder system prompt.

Responsibilities:
- Keep response advisory.
- Enforce Godot-only/GDScript-first instruction in system prompt.
- Avoid file writes.

### `godotcoder harness "<game goal>"`

Runs directed multi-agent workflow.

Responsibilities:
- Support greenfield and brownfield projects.
- Create/update agent roster, backlog, planning artifacts, project index, runtime profile, and run record.
- Route phases through orchestrator, scout, producer, designer, architect, gameplay engineer, QA validator, and docs librarian.
- Preview implementation by default.
- Apply changes only with `--apply`.
- Run Godot validation after apply unless disabled.
- Optionally request model advisory with `--llm`.
- Write `.godotcoder/runs/<run-id>.json`.

### `godotcoder runtime doctor`

Discovers Godot runtime details.

Responsibilities:
- Prefer `.godotcoder.local/runtime-overrides.json` when present.
- Detect native `godot`/`godot4` binaries if available.
- Detect Flatpak apps that look like Godot.
- Run version command where possible.
- Check project path access.
- Record supported validation commands.

### `godotcoder runtime use <godot command>`

Pins the Godot command for the current machine.

Examples:

```bash
godotcoder runtime use godot
godotcoder runtime use flatpak run org.godotengine.Godot
```

Responsibilities:
- Write `.godotcoder.local/runtime-overrides.json`.
- Classify the command as native, Flatpak, or custom.
- Re-run discovery through the override.
- Refresh `.godotcoder/runtime-profile.json`.
- Keep machine-specific runtime choices out of git.

### `godotcoder inspect`

Inspects the Godot project without using a model.

Responsibilities:
- Parse `project.godot`.
- Summarize main scene, features, input map, autoloads, plugins, export presets.
- Index scripts/scenes/resources at a shallow level.
- Produce or update `project-index.json`.

### `godotcoder validate`

Runs Godot-backed validation where available.

Responsibilities:
- Confirm runtime profile.
- Run project load/check command.
- Capture stdout/stderr.
- Parse Godot errors/warnings.
- Write validation report.

### `godotcoder plan "<game idea>"`

First planning workflow. It is deterministic in the current slice and should become model-backed in the next agent slice.

Responsibilities:
- Support greenfield folders without `project.godot`.
- Create a minimal Godot project scaffold when no project exists.
- Read workspace artifacts and project index.
- Retrieve relevant official Godot docs where available.
- Produce/update brief, GDD, technical plan, tasks, decisions, and risks.
- Avoid code edits in the first planning pass.

### `godotcoder build "<task>"`

First deterministic build workflow. It should become model-backed after patch safety and approval records are in place.

Responsibilities:
- Support greenfield and brownfield Godot projects.
- Create a small playable first slice from the current project plan.
- Keep generated game code Godot-native and GDScript-first.
- Preview file changes before writing by default.
- Run Godot-backed validation after building unless disabled.
- Report written files and validation results.

## 4. Workspace Layout

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
  validations/
  sessions/
  patches/
  logs/
  cache/
    docs/

.godotcoder.local/
  secrets.json
  user-settings.json
  runtime-overrides.json
  model-config.json
```

Version-control policy:
- Commit durable project artifacts and `runtime-profile.json`.
- Do not commit caches, logs, sessions, local secrets, or local overrides.
- Treat patch records as optional for audit trails.

## 5. Workspace Schemas

Schemas should be implemented with TypeBox or an equivalent runtime-validating TypeScript schema system.

### `runtime-profile.json`

```json
{
  "schemaVersion": 1,
  "projectRoot": "/abs/path/to/project",
  "godotProjectFile": "/abs/path/to/project/project.godot",
  "targetGodotMajor": 4,
  "detectedGodotVersion": null,
  "installType": "unknown",
  "executable": null,
  "flatpak": {
    "appId": null,
    "branch": null,
    "availableAppIds": []
  },
  "project": {
    "configVersion": null,
    "features": [],
    "mainScene": null,
    "autoloads": [],
    "enabledPlugins": [],
    "exportPresets": []
  },
  "paths": {
    "userData": null,
    "logs": null,
    "exportTemplates": null
  },
  "validation": {
    "supportedCommands": [],
    "lastValidationId": null
  },
  "updatedAt": "2026-06-11T00:00:00.000Z"
}
```

### `project-index.json`

```json
{
  "schemaVersion": 1,
  "projectRoot": "/abs/path/to/project",
  "godotVersionSignals": {
    "projectConfigVersion": null,
    "featureTags": [],
    "runtimeVersion": null
  },
  "mainScene": null,
  "inputMap": [],
  "autoloads": [],
  "plugins": [],
  "scripts": [],
  "scenes": [],
  "resources": [],
  "exports": [],
  "updatedAt": "2026-06-11T00:00:00.000Z"
}
```

### Validation Report

```json
{
  "schemaVersion": 1,
  "id": "val_20260611_000000",
  "command": ["flatpak", "run", "APP_ID", "--path", "/project"],
  "cwd": "/abs/path/to/project",
  "startedAt": "2026-06-11T00:00:00.000Z",
  "finishedAt": "2026-06-11T00:00:01.000Z",
  "exitCode": 0,
  "runtime": {
    "installType": "flatpak",
    "version": "4.x"
  },
  "findings": [
    {
      "severity": "error",
      "subsystem": "script",
      "file": "res://player.gd",
      "line": 12,
      "column": null,
      "message": "Example error",
      "raw": "Raw Godot output line"
    }
  ],
  "summary": {
    "errors": 0,
    "warnings": 0
  }
}
```

### Patch Record

```json
{
  "schemaVersion": 1,
  "id": "patch_20260611_000000",
  "taskId": "task_001",
  "status": "proposed",
  "createdAt": "2026-06-11T00:00:00.000Z",
  "updatedAt": "2026-06-11T00:00:00.000Z",
  "files": [
    {
      "path": "res://player.gd",
      "operation": "modify",
      "patchPath": ".godotcoder/patches/patch_20260611_000000/player.gd.patch"
    }
  ],
  "validationIds": [],
  "requiresApproval": true
}
```

Current implementation records deterministic build changes as applied patch records under:

```text
.godotcoder/patches/<patch-id>/record.json
```

Each record stores:
- prompt/task text
- summary
- changed files
- create/modify operation
- before and after SHA-256 hashes
- validation IDs, once connected

Patch statuses:
- `proposed`
- `approved`
- `applied`
- `rejected`
- `failed_validation`
- `reverted`

## 6. Subprocess JSON Protocol

The editor integration should call the CLI through subprocess JSON first.

Recommended invocation style:

```bash
godotcoder inspect --json
godotcoder validate --json
godotcoder debug --from-editor --json
godotcoder context --from-editor --json
```

### Request Envelope

For commands that accept JSON input:

```json
{
  "schemaVersion": 1,
  "requestId": "req_20260611_000000",
  "source": "godot-editor",
  "workspaceRoot": "/abs/path/to/project",
  "command": "validate",
  "payload": {}
}
```

### Response Envelope

```json
{
  "schemaVersion": 1,
  "requestId": "req_20260611_000000",
  "ok": true,
  "command": "validate",
  "data": {},
  "diagnostics": []
}
```

### Error Envelope

```json
{
  "schemaVersion": 1,
  "requestId": "req_20260611_000000",
  "ok": false,
  "command": "validate",
  "error": {
    "code": "GODOT_RUNTIME_NOT_FOUND",
    "message": "No Godot runtime was detected.",
    "details": {}
  },
  "diagnostics": []
}
```

### Editor Context Payload

```json
{
  "projectRoot": "/abs/path/to/project",
  "currentScene": "res://main.tscn",
  "selectedNodePath": "/root/Main/Player",
  "openScript": "res://player.gd",
  "recentConsoleOutput": [],
  "godotVersion": "4.x",
  "editorContext": {
    "playMode": false,
    "unsavedScenes": []
  }
}
```

Protocol rules:
- JSON output must be machine-readable on stdout.
- Human logs should go to stderr in `--json` mode.
- Every error should have a stable `code`.
- The CLI should be usable without the editor integration.

## 7. Godot Runtime Discovery

Runtime discovery order:
1. Explicit `.godotcoder.local/runtime-overrides.json`.
2. Existing `runtime-profile.json`.
3. Native binary scan: `godot`, `godot4`, configured paths.
4. Flatpak app scan.
5. User-facing error with next steps.

Native scan command examples:

```bash
godot --version
godot4 --version
```

Flatpak scan command:

```bash
flatpak list --app --columns=application,name,branch
```

Candidate app IDs should include names matching `godot`, but the runtime adapter must not hardcode one ID.

Known Flatpak candidate IDs to try when present:
- `org.godotengine.Godot`
- `org.godotengine.GodotSharp`
- versioned or branch-specific Godot Flatpak IDs if discovered locally.

Current local discovery result on 2026-06-11:
- `flatpak list --app --columns=application,name,branch` returned installed apps, but no Godot app was visible.
- `flatpak run org.godotengine.Godot --version` failed because `app/org.godotengine.Godot/x86_64/master` is not installed.

Implication:
- Native Godot is available and should be treated as a first-class runtime.
- `runtime doctor` should still report that no Godot Flatpak was found, because Flatpak integration remains supported when installed.

## 8. Validation Ladder

MVP validation:
1. Workspace validation: `.godotcoder/` exists and schemas parse.
2. Project validation: `project.godot` exists and parses.
3. Runtime validation: Godot executable/app ID exists and version can be read.
4. Godot project load/check: run the safest supported Godot command for the detected version.
5. Output parsing: convert Godot output to structured findings.

Later validation:
1. Main-scene smoke run with timeout.
2. Scene-specific validation.
3. Export preset validation.
4. Export template validation.
5. Screenshot or frame inspection.

Validation should prefer Godot's own output over model assumptions.

## 9. Patch Safety Model

Allowed by default:
- Textual patches for `.gd`, `.md`, `.json`, and simple config-like files.
- Tightly scoped edits to `project.godot`.

Restricted:
- Whole-file rewrites of `.tscn` and `.tres`.
- Asset deletion/move/overwrite.
- External dependency installation.
- Non-Godot code introduction.

Scene/resource edits should eventually route through the Godot editor integration or Godot-aware structured operations.

Approval gates:
- Reading/searching/indexing can be automatic.
- Patch proposal can be automatic.
- Patch application requires approval.
- Scene/resource/project setting changes require approval.
- Destructive operations require explicit approval and should be rare.

## 10. Knowledge Sources

Priority:
1. Local project files.
2. Official Godot docs for the detected runtime version.
3. Curated GodotCoder skills.
4. Hugging Face Godot datasets/examples.
5. General model knowledge.

Official docs ingestion should start as an interface and metadata model. Full local indexing can come after `inspect` and `validate` are working.

## 11. Model Benchmark Plan

Create a small benchmark before optimizing prompts or selecting long-term defaults.

Tasks:
- Generate a Godot 4 `CharacterBody2D` controller.
- Convert a Godot 3 `KinematicBody2D` script to Godot 4.
- Add input map actions to `project.godot`.
- Diagnose a signal connection error.
- Fix a missing scene/preload path.
- Generate a minimal UI `Control` layout.
- Write a save/load resource pattern.
- Produce a patch rather than a full-file rewrite.

Scoring:
- Godot 4 API correctness.
- Patch quality.
- Existing structure preservation.
- Error diagnosis accuracy.
- Godot validation result.
- Latency and cost.

## 12. Implementation Slices

### Slice 1: Workspace And Runtime

- Scaffold TypeScript CLI.
- Implement `init`.
- Implement `status`.
- Implement `runtime doctor`.
- Add schemas for `runtime-profile.json`.

### Slice 2: Project Inspection

- Parse `project.godot`.
- Extract main scene, features, autoloads, input map, plugins, export presets.
- Write `project-index.json`.
- Implement `inspect --json`.

### Slice 3: Validation

- Implement runtime command construction.
- Implement `validate`.
- Capture and parse Godot output.
- Write validation reports.

### Slice 4: Planning Workflow

- Wire Pi-style provider layer.
- Implement `plan`.
- Update brief/GDD/technical-plan/tasks/decisions/risk-log.

### Slice 4.5: First Playable Builder

- Implement deterministic `build`.
- Generate a simple playable 2D prototype.
- Preview build changes before applying.
- Validate through Godot.

### Slice 5: Editor Integration Prototype

- Minimal Godot plugin/local adapter.
- Calls CLI with subprocess JSON.
- Sends current project, current scene, selected node, open script, recent console output.
- Displays result.
- Triggers `status`, `validate`, and `debug current error`.
