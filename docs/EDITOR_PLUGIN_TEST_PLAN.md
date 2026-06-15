# GodotCoder Editor Plugin Test Plan

Goal: verify Godot editor plugin can capture editor context, round-trip it through `godotcoder rpc`, and persist recent outputs.

## Scope

- Editor context capture from active scene, selected nodes, open scenes, selected paths, and current script.
- RPC round-trip through `editor.context`.
- Automatic editor-context attachment on regular RPC calls.
- Saved dock history under `user://godotcoder/plugin-history.json`.
- Structured RPC envelope rendering in the output panel.
- Configurable CLI path in the dock.
- Separate stdout, stderr, and exit-code display for process runs.
- Explain action for selected scene/node/script context through `editor.explain`.
- Review action for read-only git workspace summaries through `workspace.changes`.
- Debug action for pasted Godot console/error text through `debug.current`.
- Preview action for `build.preview`, showing compact file counts and changed paths.
- Replay last, replay selected, and clear controls on the dock.

## Manual Checks

1. Enable `addons/godotcoder/` in a Godot project.
2. Open a scene with at least one selected node and one open script.
3. Click `Capture`.
4. Confirm dock shows structured editor context JSON.
5. Confirm output panel shows `godotcoder rpc editor.context --json`.
6. Confirm history panel adds a new entry.
7. Run `Status`, `Inspect`, or `Validate` and confirm response includes `editorContext`.
8. Click `Explain` and confirm `editor.explain` summarizes selected scene/node/script context and project counts.
9. Click `Review` and confirm `workspace.changes` reports current git status without applying edits.
10. Paste a Godot error into the debug field, click `Debug`, and confirm `debug.current` returns subsystem, source file, and next-step guidance.
11. Enter a build prompt, click `Preview`, and confirm the output shows file counts, line counts, and changed paths without applying edits.
12. Use `Replay Selected` on an older entry and confirm the stored command payload is replayed.
13. Use `Replay Last` and confirm dock refreshes output.
14. Change the CLI path setting to a bogus command and confirm the dock surfaces the failure path clearly.
15. Change selection and repeat capture to verify history grows and context changes.

## CLI Checks

```bash
npm run check
npm run test:smoke
```

Expect:

- `rpc` success envelopes for `editor.context`.
- `rpc` success envelopes for `workspace.changes`.
- `rpc` success envelopes for `editor.explain`.
- `rpc` success envelopes for `debug.current`.
- `rpc` success envelopes for `build.preview` include `previewSummary`.
- `rpc` error envelope for unknown methods.
- No regressions in build, repair, docs, or provider smoke tests.

## Acceptance Criteria

- Plugin captures real editor state, not placeholder data.
- Plugin stores recent entries between sessions.
- RPC payload round-trip preserves JSON structure.
- UI stays usable when no scene is open or no nodes are selected.
- Explain action returns useful project and focus summaries without invoking a model.
- Review action is read-only and reports clean/non-clean git state, changed files, and counts.
- History replay uses the stored command payload, not ad hoc UI state.
- History picker selects the newest entry after refresh and replay selected uses the chosen item.
- Missing or invalid CLI paths produce a readable failure in the dock instead of silent breakage.
- Debug action preserves editor context and returns deterministic triage for pasted errors.
- Preview action remains read-only and shows compact review data before any apply path exists.
- Regular RPC calls include captured editor context when available.
