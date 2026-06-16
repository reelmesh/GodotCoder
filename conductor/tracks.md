# Track Registry: GodotCoder

This document tracks active development streams, pending backlog, and completed milestones for GodotCoder.

## Integrated Remote Tracks (from `origin/main`)

| Track ID | Description | Status | Spec / Plan | PR / Branch |
|---|---|---|---|---|
| 001-smoke-run-validation | Main-scene Headless Smoke Run Validation | Completed | [spec.md](file:///home/carlosm/Documents/Dev/GodotCoder/conductor/tracks/001-smoke-run-validation/spec.md) / [plan.md](file:///home/carlosm/Documents/Dev/GodotCoder/conductor/tracks/001-smoke-run-validation/plan.md) | N/A |
| 002-export-validation | Export Preset Validation | Completed | [spec.md](file:///home/carlosm/Documents/Dev/GodotCoder/conductor/tracks/002-export-validation/spec.md) / [plan.md](file:///home/carlosm/Documents/Dev/GodotCoder/conductor/tracks/002-export-validation/plan.md) | N/A |
| 003-editor-plugin-debug | Editor Plugin Debugger & Console Integration | Completed | [spec.md](file:///home/carlosm/Documents/Dev/GodotCoder/conductor/tracks/003-editor-plugin-debug/spec.md) / [plan.md](file:///home/carlosm/Documents/Dev/GodotCoder/conductor/tracks/003-editor-plugin-debug/plan.md) | N/A |
| 004-model-hardening | LLM Provider Hardening & Context Enrichment | Completed | [spec.md](file:///home/carlosm/Documents/Dev/GodotCoder/conductor/tracks/004-model-hardening/spec.md) / [plan.md](file:///home/carlosm/Documents/Dev/GodotCoder/conductor/tracks/004-model-hardening/plan.md) | N/A |

## Local Enhancement Tracks

### `track-001`: Conductor Integration
- **Objective**: Establish the Conductor multi-agent context configuration.
- **Tasks**:
  - [x] Create project-wide `GEMINI.md` configurations.
  - [x] Establish the project Conductor layer: `product.md`, `tech-stack.md`, `workflow.md`.
  - [x] Create the `tracks.md` registry.
  - [x] Document and verify hook configuration.
- **Status**: Completed

### `track-002`: CLI Enhancements & Playtesting (Option 2 & 3)
- **Objective**: Build robust interactive repair commands, automated input-simulated playtesting, and parser recovery.
- **Tasks**:
  - [x] Develop interactive repair status, diffing, and revert/undo operations.
  - [x] Develop headless playtest runner simulating inputs for 5 seconds to catch runtime errors.
  - [x] Enhance JSON parsing with raw newline repair for local LLM models.
- **Status**: Completed

### `track-003`: Extended Repair Rules & RAG
- **Objective**: Implement docs RAG and legacy GDScript migrations.
- **Tasks**:
  - [x] Implement docs parser and HTML cleaning cache.
  - [x] Implement deterministic repair rules for missing scripts, scenes, and resources.
- **Status**: Completed

### `track-004`: Godot Editor Integration (Option 1)
- **Objective**: Develop the editor interface dock for Godot.
- **Tasks**:
  - [x] Create the Editor Plugin files in `addons/godotcoder/` (plugin, dock).
  - [x] Enable the plugin and verify compatibility in `project.godot`.
- **Status**: Completed
