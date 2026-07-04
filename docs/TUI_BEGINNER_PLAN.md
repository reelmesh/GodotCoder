# Beginner TUI Plan

GodotCoder should stay CLI-first for speed, scripting, and reliable automation, but the default human entry point should feel like a small terminal app rather than a command list.

## Product Goal

Make `godotcoder` open into a guided terminal home that helps a beginner answer three questions:

- Is my project detected?
- Is Godot and my model configured?
- What should I do next?

Power users keep every direct command and JSON mode. The TUI is a front door, not a replacement for the CLI.

## Completed Foundation

- Interactive shell with slash commands.
- Keyboard-driven home menu with arrow keys, type-to-jump, space/enter, and numbered fallback.
- Menu-first setup, settings, model, auth, runtime, pipeline, and run-history flows.
- Godot editor dock for RPC actions and summaries.

## Slice 1: Beginner Home

Make the default TTY launch open a guided home menu before dropping to the slash-command prompt.

Acceptance criteria:

- `godotcoder` starts with a home menu in TTY sessions.
- The home menu shows project, workspace, runtime, model, and suggested next action.
- Beginner labels explain outcomes without requiring command knowledge.
- Back exits to the normal slash-command prompt for power users.
- Existing `/menu` and `godotcoder menu` behavior continues to work.

## Slice 2: Guided Setup Checklist

Turn setup into a checklist-style flow:

- Detect/create workspace.
- Detect or choose Godot runtime.
- Configure model provider.
- Confirm build role.
- Run a quick status check.

## Slice 3: Guided Brownfield Workflow

Add a menu path for existing projects:

- Inspect project.
- Validate.
- Choose intent: fix, feature, refactor, polish.
- Enter focused task.
- Preview changes.
- Apply only after explicit confirmation.

## Slice 4: Preview Review Screen

Replace raw preview output in TUI mode with a compact review:

- Files changed.
- Create/modify/unchanged counts.
- Added/removed lines.
- Brownfield safety findings.
- Apply, reject, or revise prompt.

## Slice 5: Session Dashboard

Add a persistent summary path:

- Latest validation.
- Latest playtest.
- Latest task state.
- Latest model quality.
- Pending build preview.

## Non-Goals

- Do not add a heavyweight terminal UI dependency until the existing menu engine clearly cannot carry the workflow.
- Do not remove direct commands or JSON output.
- Do not duplicate orchestration outside the CLI command layer.
