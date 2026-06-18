# GodotCoder PRD

## 1. Product Summary

GodotCoder is a CLI-first AI-assisted game development application for Godot that helps a developer move from idea to playable, exportable game through structured planning, code generation, scene editing, debugging, asset workflow guidance, and iterative validation.

The product is not just a chat panel or editor plugin. It is a fast, nimble, terminal-native directed agent harness with a true Godot editor integration for live context, command entry points, project memory, review gates, and repeatable workflows. Its core promise is:

> Describe the game you want, collaborate with specialized AI agents, inspect every meaningful change, and steadily convert the idea into a working Godot project.

## 2. Target Users

- Solo Godot developers who want help turning ideas into playable prototypes.
- Designers or artists who know game feel but need implementation support.
- Technical users who want faster iteration, debugging, refactoring, and architecture guidance.
- Learning users who want the assistant to explain Godot patterns while building real projects.

## 3. Primary Goals

- Build full Godot games through guided stages: ideation, design, architecture, implementation, test, polish, export.
- Keep the developer in control through previews, diffs, confirmation gates, and rollback.
- Make the AI use real project context instead of guessing.
- Support multiple LLM providers through a replaceable model/provider layer.
- Make agent behavior deterministic enough to debug, test, and improve.
- Make every skill, tool, agent, and harness appropriate to Godot development workflows on Linux.
- Support both native Godot and Godot Flatpak as first-class Linux runtime targets, with room for Steam, AppImage, and custom binary support later.
- Deliver the first product as a CLI application that can operate quickly from a terminal, scriptable workflow, or editor-integrated terminal.
- Use a modern workspace paradigm so each game project has durable artifacts, memory, tasks, decisions, runtime profile, and agent state.
- Add a true Godot editor integration as the planned companion to the CLI so most work can stay CLI-driven while Godot provides context capture, command entry points, validation triggers, editor feedback, logs, and approved Godot-native operations.
- Keep the game synthesis path open-ended. LLMs should shape arbitrary game ideas into plans, tasks, and implementation steps; deterministic scaffolds are fallback tooling, not the product boundary.
- Allow base templates or builder registries as optional accelerators, but never let them become a genre whitelist or block original game structures.
- Keep the product focused as an exclusively Godot coding application. Non-Godot languages, frameworks, and generic app patterns should not enter the game codebase unless the project explicitly uses them.
- Use the Godot application itself as the highest-priority validator for project loading, script errors, scene errors, imports, runtime logs, and export checks.

## 4. Non-Goals For The First Version

- Fully autonomous publishing to stores.
- Replacing Godot's editor UI.
- Building a full graphical desktop application.
- Requiring an in-editor plugin for the MVP.
- Supporting every game genre with equally deep preset coverage on day one.
- Generating high-quality final art, music, and narrative without human direction.
- Multiplayer, 3D tooling, and complex procedural content as first-class MVP requirements.

## 5. Product Principles

- **CLI-first:** The MVP should be fast to start, easy to script, usable over SSH or terminal panes, and independent of Godot editor UI availability.
- **Integrated CLI workflow:** The CLI remains the source of truth, but Godot should make it easy to invoke CLI workflows from the editor with live context attached.
- **Integration-ready:** The CLI should expose a stable local interface that a Godot editor integration can call without duplicating orchestration logic.
- **Godot-native first:** Work with scenes, nodes, scripts, resources, autoloads, signals, project settings, and editor workflows directly.
- **Godot-only code generation:** Default to GDScript and Godot resource/scene/project files. Avoid introducing Python, JavaScript, C#, C++, shell scripts, or external frameworks into a game project unless the user explicitly approves that technology for that project.
- **Godot as judge:** Prefer validation performed by the installed Godot executable over model confidence, generic linters, or hand-written assumptions.
- **Linux-first execution:** Assume Linux as the initial operating environment and handle native Godot binaries, Flatpak paths, sandboxing, command invocation, logs, and filesystem permissions deliberately.
- **Workspace-oriented:** Treat every Godot project as a GodotCoder workspace with explicit artifacts, state, tasks, decisions, and runtime profile.
- **Directed autonomy:** Agents can act, but only inside explicit tools, scopes, and approval policies.
- **Visible changes:** File edits and scene edits should be reviewable before application.
- **Small verified steps:** Prefer narrow changes that can be run, parsed, linted, or inspected.
- **Context over cleverness:** Project index, open files, selected nodes, console output, and game design docs should guide the model.
- **Recoverability:** Every operation should be cancellable, replayable, or revertible where practical.

## 6. Core Workflows

### 6.0 CLI Workspace Flow

The user works from a terminal inside or near a Godot project.

Example commands:
- `godotcoder init`
- `godotcoder status`
- `godotcoder brainstorm`
- `godotcoder gdd`
- `godotcoder plan`
- `godotcoder build <task>`
- `godotcoder debug`
- `godotcoder runtime doctor`
- `godotcoder review`

Output:
- Human-readable terminal summaries.
- Persistent workspace artifacts in `.godotcoder/`.
- Reviewable patches before writes.
- Machine-readable JSON output where useful for future editor integrations.

### 6.0.1 Godot Editor Integration Flow

The Godot editor integration is a lightweight plugin or local adapter that connects the running Godot editor to the CLI workspace. It should make CLI-first development feel native inside Godot without moving agent orchestration into the editor.

Integration responsibilities:
- Provide editor actions for common CLI workflows: status, brainstorm, plan, build selected task, debug current error, validate current scene, and review current changes.
- Send selected node, current scene, open script, and project metadata to the CLI.
- Stream Godot console output and editor/runtime errors to `godotcoder debug`.
- Request agent actions from inside the editor while keeping orchestration in the CLI.
- Display patch summaries, task status, and validation results.
- Show the exact CLI command being run so workflows remain learnable and scriptable.
- Apply only approved operations, preferably by calling the CLI or a local integration API.
- Offer a command palette or quick action menu for GodotCoder commands.
- Expose "copy/run in terminal" behavior for users who prefer staying in the shell.

The integration should not own model orchestration, long-term memory, provider logic, or planning artifacts. Those belong to the CLI/workspace core.

### 6.1 Ideation To Game Brief

The user describes a game idea. The agent asks targeted questions, identifies the core fantasy, platform, scope, controls, art direction, and technical risk, then produces a short game brief.

Output:
- Game pitch
- Target platform
- Core loop
- Primary mechanics
- MVP scope
- Risks and unknowns

### 6.2 Game Design Document

The agent turns the brief into a compact GDD optimized for implementation.

Output:
- Player experience goals
- Mechanics
- Entities
- Scenes
- UI states
- Progression
- Content list
- Acceptance criteria for a playable vertical slice

### 6.3 Technical Plan

The agent maps the GDD to a Godot architecture.

Output:
- Godot version target
- Folder structure
- Scene tree plan
- Scripts and responsibilities
- Resources and data files
- Autoloads
- Input map
- Signals/events
- Save data needs
- Testing and validation plan

### 6.4 Implementation Harness

The agent proposes changes as patch operations and Godot-specific operations.

Expected tools:
- Read project files
- Search project files
- Inspect selected scene/node context
- Inspect `project.godot`, `.godot/` metadata where available, scene files, import files, export presets, and runtime/editor logs for version and project configuration signals
- Create/update scripts
- Create/update scenes
- Update project settings and input map
- Apply patch after approval
- Run Godot in check/headless mode where available
- Launch Godot through Flatpak when configured
- Locate Godot user data, logs, editor settings, project files, and export templates on Linux
- Capture and summarize console errors
- Treat Godot load/import/script/runtime errors as first-class validation results

### 6.5 Debug And Repair

The agent watches or ingests errors, traces the likely root cause, proposes a minimal fix, applies it after approval, and reruns validation.

Input:
- Godot console output
- Stack trace
- Recently changed files
- Current scene
- Relevant scripts

Output:
- Root cause
- Minimal fix
- Regression check

### 6.6 Playtest Loop

The user reports playtest feedback. The agent classifies it as bug, feel issue, missing content, balance, UX, performance, or scope change. It updates docs and proposes implementation tasks.

## 7. Agent Roles

### Product/Game Designer

Owns ideation, core loop, player fantasy, scope, mechanics, and GDD updates.

### Godot Architect

Owns scene structure, resource design, autoload policy, signal/event patterns, performance risks, and maintainability.

### Godot Implementer

Owns script and scene edits, diffs, tool calls, tests, and validation.

### Linux/Godot Runtime Engineer

Owns Godot executable discovery, Flatpak command strategy, process launching, editor/headless validation, Linux paths, permissions, logs, and later support for non-Flatpak installs.

### Debugger

Owns console diagnostics, repro steps, root-cause analysis, and repair patches.

### Godot Validation Engineer

Owns validation performed through Godot itself: executable discovery, version checks, project loading, headless/editor runs, scene opening, import errors, script errors, runtime smoke tests, export checks, and log normalization.

### Technical Artist

Owns shaders, particles, animation setup, camera feel, UI visual polish, and placeholder asset strategy.

### Producer/Scope Guard

Owns milestones, task slicing, risk tracking, and stopping the agent from expanding scope without approval.

## 8. MVP Feature Set

### Must Have

- CLI-based Godot assistant that runs from the project workspace.
- Project context indexing for scripts, scenes, resources, and docs.
- Slash-command or mode-based workflows: `/brainstorm`, `/gdd`, `/plan`, `/build`, `/debug`, `/review`.
- Safe file patch generation with user approval before writes.
- Godot console/error ingestion.
- Basic project creation or bootstrap for a 2D game.
- Input map editing support.
- Scene/script generation for a small vertical slice.
- Persistent project memory: brief, GDD, architecture, decisions, tasks.
- Provider abstraction for multiple LLMs with tool-calling support.
- Linux runtime profile with native Godot and Godot Flatpak support.
- Godot-specific skills, tools, and agent prompts rather than generic coding-agent behavior.
- Workspace commands for init, status, planning, building, debugging, runtime inspection, and review.
- Project metadata inspection from `project.godot`, `.godot/` metadata where appropriate, import files, export presets, and Godot runtime output.
- Godot-executable validation as the default verification path after build/debug operations.

### Should Have

- Interactive terminal UI for chat, task selection, diff review, and approvals.
- Visual diff review for text files.
- Scene tree inspection and selected-node context.
- Automated validation using Godot command-line checks when possible.
- Runtime smoke tests that launch the project/main scene briefly and collect Godot logs.
- Task board generated from the GDD and technical plan.
- Cost/token tracking per session.
- Model routing by task type.
- Runtime detection for native Godot binaries in addition to Flatpak.
- Lightweight Godot editor integration prototype for selected-node context, command invocation, validation triggers, and console/error streaming.

### Could Have

- Vector search over project files.
- Screenshot/canvas feedback loop.
- Asset placeholder generation.
- Git branch and commit helper.
- Agent transcripts tied to tasks.
- Export preset assistance.

## 9. Suggested Architecture

### 9.0 Chosen Foundation Projects

GodotCoder is intentionally based on three reference pillars:

- **Pi Coding Agent:** Use as the model/provider and coding-agent foundation. The relevant patterns are tool-calling, streaming, model registry, provider abstraction, context persistence, OAuth/API key handling, token usage, and agent handoff.
- **BMAD Methodology:** Use as the planning and delivery methodology. The relevant patterns are staged artifacts, specialist roles, task decomposition, acceptance criteria, decision logs, and keeping implementation aligned with product intent.
- **Existing Godot AI Plugin:** Use as the Godot editor integration reference. The relevant patterns are editor dock UX, Godot project context, scene/script awareness, safe diff application, watch/debug mode, vector/project indexing, and Godot-specific skill prompts.
- **OpenCode:** Use as a terminal-agent UX and CLI architecture reference. The relevant patterns are interactive session flow, command ergonomics, terminal UI conventions, configuration, packaging, and developer experience.

The product should synthesize these projects rather than clone any one of them. Pi supplies the LLM execution spine, BMAD supplies the development operating system, the Godot plugin supplies the editor-native interaction model, and OpenCode supplies a reference for the interactive terminal agent experience.

### 9.1 Application Layers

- **CLI Layer:** Terminal commands, interactive session UI, status output, approvals, JSON output mode, and scripting hooks.
- **Local Integration API:** Stable interface between the CLI core and external clients such as a Godot editor plugin. This can begin as subprocess JSON commands and later become a local socket or HTTP API if needed.
- **Agent Orchestrator:** Workflow state machine, agent roles, task decomposition, approval policy, memory updates.
- **LLM Provider Layer:** Unified model API, streaming, tool calls, OAuth/API key handling, token and cost tracking.
- **Tool Runtime:** File tools, Godot tools, Linux process tools, validation tools, project index tools, patch tools.
- **Godot Runtime Adapter:** Discovers and invokes Godot through native binaries or Flatpak; normalizes paths, logs, command arguments, and validation results.
- **Godot Project Inspector:** Reads project files and runtime/editor metadata to infer Godot version, rendering mode, features, main scene, input map, autoloads, plugins, export presets, and project structure.
- **Validation Harness:** Runs Godot-backed checks and converts output into structured findings for the agent.
- **Memory And Artifacts:** Brief, GDD, architecture notes, task list, decisions log, project index.
- **Godot Editor Integration:** Editor plugin or local adapter for command entry points, selected-node context, editor events, console/log streaming, validation triggers, patch review feedback, and richer scene operations after the CLI MVP is stable.

### 9.2 Initial Reference Sources

- `source_projects/gamedev_ai`: Godot plugin patterns, watch mode, diffs, context management, Godot skill docs.
- `source_projects/pi/packages/ai`: provider abstraction, tool-calling, streaming, model registry, context persistence.
- `source_projects/bmad-method-instalation`: planning artifacts and agent role inspiration.
- `opencode`: terminal-agent UX, CLI ergonomics, configuration, packaging, and interactive session reference.
- Official Godot public documentation: primary versioned source for Godot API behavior, editor concepts, command-line usage, exports, class references, tutorials, and examples.
- `docs/TECHNICAL_DESIGN.md`: implementation architecture, workspace schemas, subprocess JSON protocol, validation ladder, patch lifecycle, runtime discovery, and first build slices.

## 10. Data Artifacts

Store these in a project-owned folder, for example `.godotcoder/`:

- `brief.md`
- `gdd.md`
- `technical-plan.md`
- `tasks.md`
- `tasks.json`
- `decisions.md`
- `risk-log.md`
- `agent-memory.json`
- `project-index.json`
- `runtime-profile.json`

## 10.0 Workspace Paradigm

GodotCoder should use a modern workspace model centered on the Godot project directory.

Workspace behavior:
- `godotcoder init` creates `.godotcoder/` in the current Godot project.
- The workspace stores durable planning artifacts, agent state, task state, decisions, runtime profile, playtest records, and cached project index.
- Commands operate relative to the workspace root.
- The workspace can be inspected with `godotcoder status`.
- The workspace should be portable with the project, except for personal secrets and local machine paths.
- Machine-local settings should be separated from team/project artifacts.

Suggested layout:

```text
.godotcoder/
  brief.md
  gdd.md
  technical-plan.md
  tasks.md
  tasks.json
  decisions.md
  risk-log.md
  runtime-profile.json
  project-index.json
  agent-memory.json
  sessions/
  patches/
  logs/
  cache/
  playtests/
```

Suggested local-only layout:

```text
.godotcoder.local/
  secrets.json
  user-settings.json
  runtime-overrides.json
```

## 10.1 Linux And Godot Runtime Profile

The first supported runtime profile is Linux with Godot installed either as a native binary/package or through Flatpak.

Initial assumptions:
- Native command candidates: `godot`, `godot4`, and user-configured executable paths.
- Flatpak command candidates should be discovered from `flatpak list --app`; do not hardcode one app ID as the only valid option.
- Godot editor and headless/check workflows may require different arguments depending on version and install type.
- Project paths must be passed in a way the selected runtime can access. For Flatpak, the app should detect and explain permission problems instead of failing silently.
- Logs may live under Flatpak-managed user data paths or native XDG paths, depending on install type.
- The runtime adapter should keep command construction centralized so later install types can be added without rewriting agent tools.

Future runtime targets:
- AppImage.
- Steam installation.
- Custom user-configured executable path.

Runtime profile fields:
- Godot version.
- Project config version.
- Project feature tags from `project.godot`.
- Install type: `native`, `flatpak`, `appimage`, `steam`, or `custom`.
- Executable command.
- Project access status.
- User data path.
- Logs path.
- Export template status.
- Supported validation commands.
- Main scene.
- Autoloads.
- Enabled plugins.
- Export presets.

## 10.2 Godot-Specific Skills, Tools, Agents, And Harnesses

GodotCoder should avoid generic software-agent behavior when a Godot-specific operation exists.

Skills should cover:
- GDScript 2.0 style and modern Godot 4 APIs.
- Scene tree design.
- Node composition.
- Signals, groups, resources, autoloads, and input maps.
- Physics, collision layers, animation, UI `Control` layout, shaders, particles, audio, save systems, localization, performance, exports, and debugging.

Tools should cover:
- Project inspection.
- Scene inspection.
- Script parsing/search.
- Resource inspection.
- Input map editing.
- Project settings editing.
- Safe patch application.
- Godot launch/check/debug commands.
- Console and log ingestion.
- Project version/config inference from `project.godot`, import metadata, export presets, and Godot runtime output.
- Godot-only code policy checks that flag accidental non-Godot technologies in generated patches.

Harnesses should cover:
- Ideation to brief.
- Brief to GDD.
- GDD to Godot technical plan.
- Technical plan to task list.
- Task to patch.
- Patch to validation.
- Error log to repair.
- Playtest feedback to next tasks.

Agents should be specialized by Godot responsibility, not only by generic software role.

## 10.3 Official Godot Documentation Source

GodotCoder should treat the official public Godot documentation as a primary knowledge source.

Use cases:
- Ground API-sensitive answers in the correct Godot version.
- Retrieve class reference details during `/build`, `/debug`, and `/review`.
- Compare generated GDScript against modern Godot 4 patterns.
- Support runtime commands, editor concepts, project settings, input maps, exports, and platform-specific workflows.
- Build benchmark/evaluation cases from official examples.

Implementation approach:
- Track the workspace's target Godot version in `runtime-profile.json`.
- Infer the target version from the Godot executable and project metadata whenever possible.
- Maintain a local docs index under `.godotcoder/cache/docs/`.
- Prefer official docs over third-party datasets for exact API facts.
- Store source page metadata with retrieved chunks so the agent can explain where an API claim came from.
- Rebuild or invalidate the docs index when the Godot version changes.

The Hugging Face Godot datasets remain useful as secondary sources for examples, retrieval experiments, and evaluation, but they should not outrank official docs for correctness.

## 10.4 Godot-Only Code Policy

GodotCoder is an exclusively Godot coding app.

Default generated project code should be limited to:
- GDScript.
- Godot scene files: `.tscn`, `.scn` where applicable.
- Godot resource files: `.tres`, `.res` where applicable.
- Godot project files: `project.godot`, import metadata, export presets, translation files, shader files, and other native Godot asset/resource formats.

The agent should avoid introducing:
- Python runtime scripts.
- Node/JavaScript app code.
- Web frameworks.
- Generic backend services.
- C#, C++, Rust, or GDExtension code.
- External build systems.

Exceptions require explicit user approval and should be recorded in `decisions.md`.

This policy applies to game project output. GodotCoder's own CLI implementation may use a practical host language, but generated game code should stay Godot-native.

## 10.5 Godot-Backed Validation Ladder

GodotCoder should use the installed Godot application to validate builds as much as possible.

Validation stages:
- Inspect project files: `project.godot`, scenes, scripts, resources, imports, export presets.
- Detect runtime: call the configured Godot command and capture exact version.
- Load project: run Godot in the safest available non-interactive mode for the installed version.
- Validate scripts: capture parse errors and script load failures from Godot output.
- Validate scenes: open or instantiate target scenes where command-line support allows it.
- Run smoke test: launch the main scene briefly, collect logs, and terminate cleanly.
- Validate export setup: inspect export presets and templates before attempting exports.

The validation harness should normalize Godot output into structured findings:
- Severity.
- Source file.
- Line/column when available.
- Error text.
- Likely subsystem: script, scene, resource, import, project setting, plugin, export, runtime.
- Suggested next command or repair task.

## 11. Approval Policy

The agent may do without approval:
- Read files.
- Search files.
- Summarize context.
- Draft plans.
- Propose patches.
- Run non-destructive checks.

The agent needs approval before:
- Writing project files.
- Editing scenes/resources.
- Changing project settings.
- Installing dependencies.
- Running export or build commands.
- Deleting, moving, or overwriting user assets.

## 12. MVP Milestones

### Milestone 1: Planning Kernel

- Create PRD, starting prompt, architecture notes, and sample game workflow.
- Define agent modes and artifacts.
- Define tool schemas.
- Define the Linux Flatpak Godot runtime profile.
- Define Godot-specific skills, tools, agents, and harnesses.
- Define the CLI command surface and workspace layout.

Acceptance:
- A new session can produce a brief, GDD, technical plan, and task list from one game idea.
- The session knows it is targeting Godot on Linux with native or Flatpak runtime discovery unless configured otherwise.
- `godotcoder init` and `godotcoder status` behavior is specified.

### Milestone 2: Provider And Orchestrator Prototype

- Build or adapt the LLM provider layer.
- Implement streaming responses and tool-call execution.
- Store session context and artifacts.
- Provide a CLI command that runs the first agent workflow.

Acceptance:
- The app can call at least one model, execute a mocked tool, and persist the result.
- The app can read and write `.godotcoder/` workspace artifacts.

### Milestone 3: Godot Project Context

- Index scripts, scenes, resources, and docs.
- Feed selected files and scene context into the agent.
- Add basic project memory.
- Detect the Godot runtime profile on Linux.
- Define the local integration API shape for selected-node context, current scene, open script, and console output.
- Infer version/configuration from `project.godot`, Godot runtime output, import metadata, and export presets where available.

Acceptance:
- The agent can answer questions about a sample Godot project using real file context.
- The app can report how it will invoke Godot for validation.
- The CLI can accept editor-provided context as structured input, even before the editor plugin exists.
- The app can summarize the project's Godot version signals, main scene, autoloads, input map, plugins, and export preset status.

### Milestone 3.5: Godot Editor Integration Prototype

- Build a minimal Godot editor integration that can call the CLI.
- Send current project path, current scene, selected node path, and recent console output.
- Show the CLI response in a simple editor dock or output panel.
- Provide quick actions for `status`, `validate`, and `debug current error`.
- Display the CLI command being executed.
- Keep all model/provider/session orchestration in the CLI.

Acceptance:
- From inside Godot, the user can ask the CLI agent about the selected scene or node.
- The integration can pass console errors to the CLI debug workflow.
- The integration can trigger CLI validation for the current project or scene.
- The integration does not need to apply edits yet.

### Milestone 4: Safe Patch Application

- Generate file patches.
- Show before/after diff.
- Apply approved changes.
- Validate syntax or run Godot checks.
- Enforce the Godot-only code policy for generated game patches.

Acceptance:
- The agent can add a simple mechanic to a sample 2D Godot project with reviewable edits.
- The change is validated through the configured Godot executable where possible.

### Milestone 5: Vertical Slice Builder

- Implement `/brainstorm`, `/gdd`, `/plan`, `/build`, `/debug`.
- Generate a small complete 2D game prototype.
- Run error repair loop.

Acceptance:
- From a short prompt, the tool can guide creation of a playable Godot vertical slice with documented decisions.

## 13. Success Metrics

- Time from idea to playable prototype.
- Percentage of generated patches accepted without manual correction.
- Number of repair loops required after generated code.
- Token/cost per completed task.
- User trust: how often the user allows write operations.
- Project continuity: whether docs, task list, and implementation stay synchronized.

## 14. Open Questions

- What exact Godot 4.x version should be the first test target on the development machine?
- Should the first vertical slice focus on 2D only?
- How much autonomy should be allowed after the first successful validation loop?
- What exact Flatpak app ID and Godot version are installed on the development machine?
- Which Godot command-line validation mode should be the first supported target for the installed version?
- Which non-GDScript technologies, if any, should be allowed as explicit project-level exceptions?

## 15. Accepted MVP Decisions

These decisions are accepted for the first implementation track.

### 15.1 Host Language And Foundation

- Build the MVP CLI in TypeScript/Node.
- Use Pi as the main reference for provider abstraction, streaming, tool calls, model registry, context persistence, OAuth/API key handling, and token/cost tracking.
- Keep generated game project code Godot-native and GDScript-first.

### 15.2 CLI And Editor Integration Protocol

- Start with a CLI-first product.
- Use subprocess JSON as the first protocol between the Godot editor integration and the CLI.
- Defer local HTTP or Unix socket until subprocess startup or streaming limitations justify it.

### 15.3 Workspace Version-Control Policy

Commit project/team artifacts:
- `.godotcoder/brief.md`
- `.godotcoder/gdd.md`
- `.godotcoder/technical-plan.md`
- `.godotcoder/tasks.md`
- `.godotcoder/tasks.json`
- `.godotcoder/decisions.md`
- `.godotcoder/risk-log.md`
- `.godotcoder/runtime-profile.json`

Keep local or generated artifacts out of version control by default:
- `.godotcoder/cache/`
- `.godotcoder/logs/`
- `.godotcoder/sessions/`
- `.godotcoder/playtests/`
- `.godotcoder.local/`

Treat `.godotcoder/patches/` as optional: useful for audit trails, but not required for MVP commits.

### 15.4 Godot Version Target

- Target Godot 4.x for MVP.
- Detect the exact installed/runtime version.
- Warn on Godot 3 projects instead of supporting them in the first version.

### 15.5 Patch Strategy

- Use textual patches for `.gd`, `.md`, `.json`, and simple config-like files.
- Treat `project.godot` as structured data where practical; otherwise use tightly scoped patches.
- Avoid whole-file rewrites of `.tscn` and `.tres`.
- Prefer Godot/editor integration operations or tightly constrained edits for scenes and resources.

### 15.6 Validation Strategy

MVP validation should:
- Inspect project files.
- Detect Godot executable/version.
- Run Godot-backed project load/check commands where available.
- Capture and parse Godot output.
- Report structured validation findings.

Later validation should add:
- Main-scene smoke runs with timeouts.
- Scene-specific validation.
- Export checks.
- Visual/screenshot checks where useful.

### 15.7 Model And Knowledge Policy

- Use Pi's provider abstraction.
- Start with one strong cloud coding model as the default.
- Add local/Ollama models later for privacy/offline mode.
- Benchmark models against Godot tasks before changing defaults.

Knowledge source priority:
1. Local project files.
2. Official Godot docs matching runtime version.
3. Curated GodotCoder skills.
4. Hugging Face Godot datasets/examples.
5. General model knowledge.

### 15.8 Autonomy Policy

Automatic:
- Read files.
- Search files.
- Index project/docs.
- Inspect project metadata.
- Draft plans.
- Propose patches.
- Run non-destructive validation.

Requires approval:
- Write files.
- Change project settings.
- Edit scenes/resources.
- Run long or state-changing commands.
- Install dependencies.
- Delete, move, or overwrite assets.

### 15.9 First Vertical Slice

The first buildable foundation should include:
- `godotcoder init`
- `godotcoder status`
- `godotcoder runtime doctor`
- `godotcoder inspect`
- `godotcoder validate`

Then add the first planning workflow:
- `godotcoder plan "make a simple 2D asteroid shooter"`

### 15.10 Package Name

- Use `godotcoder` as the CLI command name for now.
- Package as a Node/TypeScript CLI.
- Prefer the package-manager conventions used by the Pi reference unless there is a strong reason to diverge.
