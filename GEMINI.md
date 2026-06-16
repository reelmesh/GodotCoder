# Project Context

## Overview
GodotCoder is a CLI-first AI development agent for building Godot games. It is designed to feel like a modern terminal coding agent while staying exclusively focused on Godot workflows, GDScript, Godot project files, and Godot-backed validation. The project consists of a TypeScript/Node.js CLI app, with integration for Godot 4.3 or newer runtime target.

## Tech Stack
- **Runtime Environment:** Node.js >= 22.19.0
- **Language:** TypeScript 5.9.3
- **Development Tooling:** tsx (for running TS directly), tsc (for compilation)
- **Quality Gates:** 
  - Compilation/Checking: `npm run check` (runs `tsc` without emitting code)
  - Build: `npm run build`
  - Smoke Tests: `npm run test:smoke` (Node-native tests)

## oh-my-gemini Configuration

### Hooks
oh-my-gemini uses hooks for deterministic behavior:
- ✅ Security gates (blocks dangerous commands)
- ✅ Auto-verification (typecheck/lint after changes)
- ✅ Context injection (git history, Conductor state)
- ✅ Git checkpoints (before file modifications)

### Customization
Create `.gemini/omg-config.json` to customize:
```json
{
  "phaseGates": { "strict": false },
  "autoVerification": { "enabled": true },
  "security": { "gitCheckpoints": true }
}
```

## Commands
- `/omg:status` - Show current state
- `/omg:plan` - Enter plan mode with OMG context
- `/omg:review` - Code review of current changes
- `/omg:autopilot` - Autonomous task execution
- `/omg:track` - Start a Conductor track
- `/omg:implement` - Execute current plan
