# Technical Plan: Editor Plugin Debugger & Console Integration

## Proposed Code Changes

### 1. `addons/godotcoder/plugin.gd`
- Define a helper inner class subclassing `EditorDebuggerPlugin`:
  ```gdscript
  class GodotCoderDebuggerPlugin extends EditorDebuggerPlugin:
      var main_plugin: EditorPlugin

      func _setup_session(session_id: int) -> void:
          var session := get_session(session_id)
          session.stopped.connect(func():
              if main_plugin:
                  main_plugin.call_deferred("_on_session_stopped")
          )

      func _capture(message: String, data: Array, session_id: int) -> bool:
          if message == "debug:error":
              var error_msg = str(data[0])
              var script_path = str(data[2])
              var line_num = str(data[3])
              var full_error = "SCRIPT ERROR: %s\n  at %s:%s" % [error_msg, script_path, line_num]
              main_plugin.call_deferred("_on_debugger_error", full_error)
          elif message == "debug:warning":
              var warning_msg = str(data[0])
              var script_path = str(data[2])
              var line_num = str(data[3])
              var full_warning = "WARNING: %s\n  at %s:%s" % [warning_msg, script_path, line_num]
              main_plugin.call_deferred("_on_debugger_warning", full_warning)
          return false
  ```
- In `_enter_tree()`, instantiate and register the debugger plugin using `add_debugger_plugin`.
- In `_exit_tree()`, unregister and clean up the debugger plugin using `remove_debugger_plugin`.
- Define callback handlers on the main plugin:
  - `_on_debugger_error(text: String)`: Set `error_field.text`, update status to `"Captured runtime error. Click 'Debug' to repair."`.
  - `_on_debugger_warning(text: String)`: If `error_field.text` is empty, set it and update status to `"Captured warning. Click 'Debug' to investigate."`.
  - `_on_session_stopped()`: Log session state update to `status_view`.

## Modified Files
- `addons/godotcoder/plugin.gd`
