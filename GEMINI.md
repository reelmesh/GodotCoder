# Gemini Instructions for GodotCoder

Welcome to the **GodotCoder** repository! This file provides project-specific context, conventions, and constraints for Gemini CLI / Antigravity agents working in this codebase.

## Project Overview

GodotCoder is a CLI-first AI development agent specifically tailored for building Godot games. It wraps planning, project inspection, safe code patching, validation, and deterministic repair into a TypeScript/Node.js CLI.

## Core Conventions & Rules

1. **Tech Stack Constraints**
   - **Node.js**: >= 22.19.0 (defined in [package.json](file:///home/carlosm/Documents/Dev/GodotCoder/package.json)).
   - **TypeScript**: Use TypeScript (version 5.x) for all source code. Avoid using vanilla JavaScript or writing ad-hoc `.js` scripts in the main codebase.
   - **Build Tooling**: Use `tsx` for running scripts in development (`npm run dev`) and `tsc` for building (`npm run build`).

2. **No Sandbox Escapes / Working Directory Changes**
   - **NEVER use the `cd` command** in terminal runs. The agent runs commands in the context of the workspace directory.
   - Keep paths absolute or resolve relative to the workspace root: `/home/carlosm/Documents/Dev/GodotCoder`.

3. **Pre-Verification & Type Checking**
   - Before completing any task or claiming code changes are done, you MUST verify that the codebase compiles.
   - Run type-checking using `npm run check` (`tsc -p tsconfig.json --noEmit`).
   - Run `npm run build` to ensure the build completes without errors.

4. **Code Structure**
   - Source code is divided into:
     - [src/cli.ts](file:///home/carlosm/Documents/Dev/GodotCoder/src/cli.ts): The main CLI entry point.
     - [src/commands/](file:///home/carlosm/Documents/Dev/GodotCoder/src/commands): Specific command actions.
     - [src/core/](file:///home/carlosm/Documents/Dev/GodotCoder/src/core): Internal core functionality, LLM provider integration, harness, validation, and repair engines.

5. **GDScript & Godot Target**
   - Target version is **Godot 4.3 or newer**. Do not write code using deprecated Godot 3 APIs unless it is part of the repair module meant to translate them.
   - Game projects generated or modified by GodotCoder should be GDScript-first.

6. **Workflow & Documentation**
   - Maintain documentation integrity. Keep comments and docstrings intact.
   - Refer to the Conductor workflow files under the `conductor/` directory for product specs, technical decisions, and current tracks.
