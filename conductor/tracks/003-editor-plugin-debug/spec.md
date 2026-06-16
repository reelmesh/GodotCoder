# Track Spec: Editor Plugin Debugger & Console Integration

## Overview
Currently, the GodotCoder editor plugin provides an RPC console but requires the developer to copy and paste runtime console errors manually into the `error_field` to invoke the `debug.current` repair/explanation workflow. This track implements live debugger and console log capturing using Godot's `EditorDebuggerPlugin` API. It captures script errors and warnings automatically, populates the plugin's debug field, and prompts the user to trigger AI repair.

## Goals & Requirements
1. **Debugger Integration**: Create and register a custom `EditorDebuggerPlugin` within the main `EditorPlugin`.
2. **Error & Warning Capture**: Capture `"debug:error"` and `"debug:warning"` events emitted by the running game session.
3. **Automatic UI Population**: Populate the `error_field` text box dynamically when an error occurs, updating the `status_view` to notify the user.
4. **Lifecycle Management**: Safely clean up and unregister the debugger plugin on plugin disable/exit.

## Acceptance Criteria
- Running a game from the Godot editor that encounters a GDScript error (e.g. invalid index) automatically populates the GodotCoder dock error panel with the error message and file path.
- Enters a clear status warning informing the developer that a runtime error was captured.
- Clicking the `Debug` button forwards the captured error payload cleanly to the CLI RPC endpoint.
