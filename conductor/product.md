# Product Specification: GodotCoder

## Vision & Objective
GodotCoder is a CLI-first AI development agent designed to automate and guide the creation of Godot games. It enables developers to transition from a game idea to a playable and exportable Godot project using multi-agent workflows, code generation, validation, and automated repair loops.

## Core Features
1. **Interactive Shell (`godotcoder`)**: A rich CLI prompt for running commands, generating code, and playing games.
2. **Project Scaffolding (`godotcoder init` / `/make`)**: Generates minimal Godot projects (with scenes, scripts, and configs) for greenfield game ideas.
3. **Directed Multi-Agent Harness (`godotcoder harness` / `/run`)**: Orchestrates specialized agent roles (e.g., Planner, Builder, Validator) to work sequentially on tasks.
4. **Godot-Backed Validation (`godotcoder validate` / `/check`)**: Executes headless Godot engine subprocesses to check for syntax errors, broken dependencies, or resource conflicts.
5. **Deterministic Repair (`godotcoder repair` / `/repair`)**: Automatically fixes common issues like missing script placeholders, broken paths, and legacy Godot 3 to Godot 4 API conversions.
6. **Local settings & Auth**: Handles provider configurations, API keys, and model preferences.

## Target Audience
- Game developers looking for rapid prototyping tools.
- AI researchers exploring autonomous software agent collaboration in rich interactive media environments.
- Solo developers needing an agent companion inside their command line.

## Key UX Flows
- **Idea to Playable**: User runs `/pipeline "make a 2D space shooter" --play`. The system creates a project, constructs a planning backlog, generates scripts, validates, repairs errors, and launches the Godot game.
- **Interactive Iteration**: User edits scenes, reviews changes using a line diff, applies changes via `/apply` or rejects them via `/reject`.
