# Implementation Status

Date: 2026-06-11

## Implemented

First TypeScript/Node CLI slice:

- `godotcoder init`
- `godotcoder` interactive session shell
- `godotcoder status`
- `godotcoder runtime doctor`
- `godotcoder inspect`
- `godotcoder validate`

Core modules:
- Workspace path management.
- Godot project root discovery.
- Basic `project.godot` parsing.
- Project index generation.
- Runtime discovery for Flatpak and native Godot binaries.
- Godot-backed validation with isolated workspace-local log/data/cache paths.
- JSON output suitable for future Godot editor integration.
- Interactive Codex/OpenCode-style terminal shell with slash commands for implemented workflows.

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

## Verification

Commands run:

```bash
npm run check
npm run build
```

Both passed.

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

## Next Slice

Recommended next implementation slice:

1. Add TypeBox or equivalent runtime schemas.
2. Improve `project.godot` parsing for nested sections and typed values.
3. Add `runtime-overrides.json` support.
4. Add `plan` as the first model-backed workflow.
5. Add official Godot docs source interface.
