# Product Specification: GodotCoder

## Product Overview
GodotCoder is a CLI-first AI development agent designed specifically for building games in Godot. It focuses on GDScript, Godot project files, Godot-backed validation, and editor integrations.

## Core Features
1. **Interactive Shell:** Terminal environment for Godot-centric AI assistance.
2. **Workspace Management:** `init` and `status` command suites to track project configuration.
3. **Godot Runtime Integration:** Runtime override select, doctor commands, and launch helper (`play`).
4. **Validation and Quality:** Safe file patching, validation, and auto-repair hooks powered by the Godot executable.
5. **Documentation & Help:** Documentation search and local caching of official Godot documentation.
6. **Multi-Agent Orchestration:** Harness commands and end-to-end playable pipelines for automating game development.

## Target Audience & Requirements
- **Target OS:** Linux (first-class support, supporting flatpak and native runtimes).
- **Engine Version:** Godot 4.3 or newer.
- **Languages:** GDScript first, with CLI codebase in TypeScript.
