# General Code Style Guide

## TypeScript Coding Standards

- **Strict Types**: Always compile with strict type checking enabled. Avoid using `any` unless absolutely necessary; prefer `unknown` or specific interfaces.
- **ES Modules**: The project uses ES modules (`type: "module"` in `package.json`). All relative imports must include file extensions (e.g. `import { helper } from "./helper.js"`).
- **Formatting**: Keep code clean, structured, and consistent. Follow standard TypeScript formatting guidelines.
- **Node API Usage**: Prefer native Node.js modules and APIs where possible. Use `node:` protocol imports (e.g., `import fs from 'node:fs'`).

## Godot Guidelines

- **GDScript Support**: Generated GDScript should follow official Godot 4.x style guides (snake_case naming, type hints, etc.).
- **Godot Runtime Invocation**: Ensure interactions with the `godot` subprocess are handled safely, handling standard streams, exit codes, and platform differences (native vs Flatpak).
- **Paths**: Paths targeting Godot assets should use `res://` relative formats where appropriate, and local absolute paths when executing validator sub-processes.
