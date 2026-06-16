# Tech Stack & Architecture: GodotCoder

This document records the architectural standards, software dependencies, and runtime integrations of the GodotCoder project.

## Development Environment & CLI
- **Language**: TypeScript (targeting ESNext modules).
- **Runtime**: Node.js (version `>= 22.19.0` required).
- **Core CLI Packages**:
  - `tsx` (for rapid development script execution).
  - `typescript` (compiler).
  - `@types/node` (Node.js typings).

## Core Architectures & Modules
1. **CLI Commands Layer (`src/commands/`)**: Handles high-level command registration, argument parsing, and command execution hooks.
2. **LLM Provider Engine (`src/core/providers.ts`)**: Integrates model providers (Google Gemini, Vertex AI, OpenAI, Anthropic) via a standardized provider interface.
3. **Directed Harness (`src/core/harness.ts` & `src/core/llm-build.ts`)**: Orchestrates plans and executes code builds with structured prompt chains.
4. **Validation Subsystem (`src/core/validation.ts`)**: Invokes Godot CLI headlessly (`--headless --check-only`) to inspect files, scenes, and script structures.
5. **Repair Loop (`src/core/repair.ts`)**: A rule-based engine parsing compile errors and automatically applying patches (e.g., Godot 3 GDScript to Godot 4, missing script initialization).

## External Integrations
- **Game Engine**: Godot Engine (`>= 4.3`) is the target runtime and validator. Supported installation options include native binaries (`godot` or `godot4`) and Flatpak runtimes on Linux systems.
- **Provider Credentials**: API keys and configurations are stored in the local settings area.
