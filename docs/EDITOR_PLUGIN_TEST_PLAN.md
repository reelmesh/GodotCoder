# GodotCoder Editor Plugin Test Plan

Goal: verify Godot editor plugin can capture editor context, round-trip it through `godotcoder rpc`, and persist recent outputs.

## Scope

- Editor context capture from active scene, selected nodes, open scenes, selected paths, and current script.
- RPC round-trip through `editor.context`.
- Automatic editor-context attachment on regular RPC calls.
- Saved dock history under `user://godotcoder/plugin-history.json`.
- Structured RPC envelope rendering in the output panel.
- Replay and clear controls on the dock.

## Manual Checks

1. Enable `addons/godotcoder/` in a Godot project.
2. Open a scene with at least one selected node and one open script.
3. Click `Capture`.
4. Confirm dock shows structured editor context JSON.
5. Confirm output panel shows `godotcoder rpc editor.context --json`.
6. Confirm history panel adds a new entry.
7. Run `Status`, `Inspect`, or `Validate` and confirm response includes `editorContext`.
8. Replay last command and confirm dock refreshes output.
9. Change selection and repeat capture to verify history grows and context changes.

## CLI Checks

```bash
npm run check
npm run test:smoke
```

Expect:

- `rpc` success envelopes for `editor.context`.
- `rpc` error envelope for unknown methods.
- No regressions in build, repair, docs, or provider smoke tests.

## Acceptance Criteria

- Plugin captures real editor state, not placeholder data.
- Plugin stores recent entries between sessions.
- RPC payload round-trip preserves JSON structure.
- UI stays usable when no scene is open or no nodes are selected.
- History replay uses the stored command payload, not ad hoc UI state.
- Regular RPC calls include captured editor context when available.
