@tool
extends EditorPlugin

const HISTORY_DIR := "user://godotcoder"
const HISTORY_FILE := HISTORY_DIR + "/plugin-history.json"
const SETTINGS_CLI_PATH := "godotcoder/plugin/cli_path"
const TEMP_DIR := "user://godotcoder/tmp"
const RPC_METHODS := [
	"workspace.status",
	"workspace.changes",
	"project.inspect",
	"runtime.doctor",
	"validation.run",
	"validation.scene",
	"docs.search",
	"build.preview",
	"debug.current",
	"editor.context",
	"editor.explain",
]

var dock: VBoxContainer
var method_picker: OptionButton
var status_view: Label
var output_view: TextEdit
var stderr_view: TextEdit
var context_view: TextEdit
var history_view: TextEdit
var history_picker: OptionButton
var query_field: LineEdit
var prompt_field: LineEdit
var error_field: TextEdit
var command_field: LineEdit
var history: Array = []
var debugger_plugin: GodotCoderDebuggerPlugin

func _enter_tree() -> void:
	_ensure_storage_dir()
	_load_history()
	_build_dock()
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, dock)
	_refresh_history_view()
	debugger_plugin = GodotCoderDebuggerPlugin.new()
	debugger_plugin.main_plugin = self
	add_debugger_plugin(debugger_plugin)

func _exit_tree() -> void:
	if debugger_plugin:
		remove_debugger_plugin(debugger_plugin)
		debugger_plugin = null
	if dock:
		remove_control_from_docks(dock)
		dock.queue_free()

func _build_dock() -> void:
	dock = VBoxContainer.new()
	dock.name = "GodotCoder"
	dock.size_flags_vertical = Control.SIZE_EXPAND_FILL

	var header := Label.new()
	header.text = "GodotCoder"
	dock.add_child(header)

	method_picker = OptionButton.new()
	for method in RPC_METHODS:
		method_picker.add_item(method)
	dock.add_child(method_picker)

	command_field = LineEdit.new()
	command_field.placeholder_text = "godotcoder CLI path"
	command_field.text = _load_cli_path()
	command_field.text_changed.connect(_on_command_field_changed)
	dock.add_child(command_field)

	status_view = Label.new()
	status_view.text = "CLI ready."
	status_view.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dock.add_child(status_view)

	query_field = LineEdit.new()
	query_field.placeholder_text = "docs.search query"
	dock.add_child(query_field)

	prompt_field = LineEdit.new()
	prompt_field.placeholder_text = "build.preview prompt"
	dock.add_child(prompt_field)

	error_field = TextEdit.new()
	error_field.custom_minimum_size = Vector2(0, 90)
	error_field.placeholder_text = "debug.current error text"
	dock.add_child(error_field)

	var buttons := HBoxContainer.new()
	buttons.add_child(_make_button("Capture", "_on_capture_pressed"))
	buttons.add_child(_make_button("Status", "_on_status_pressed"))
	buttons.add_child(_make_button("Inspect", "_on_inspect_pressed"))
	buttons.add_child(_make_button("Validate", "_on_validate_pressed"))
	buttons.add_child(_make_button("Scene", "_on_scene_pressed"))
	buttons.add_child(_make_button("Explain", "_on_explain_pressed"))
	buttons.add_child(_make_button("Review", "_on_review_pressed"))
	buttons.add_child(_make_button("Debug", "_on_debug_pressed"))
	buttons.add_child(_make_button("Preview", "_on_preview_pressed"))
	buttons.add_child(_make_button("Replay Last", "_on_replay_last_pressed"))
	buttons.add_child(_make_button("Replay Selected", "_on_replay_selected_pressed"))
	buttons.add_child(_make_button("Clear", "_on_clear_pressed"))
	buttons.add_child(_make_button("Run", "_on_run_pressed"))
	dock.add_child(buttons)

	history_picker = OptionButton.new()
	history_picker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	dock.add_child(history_picker)

	context_view = TextEdit.new()
	context_view.editable = false
	context_view.custom_minimum_size = Vector2(0, 160)
	context_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	context_view.placeholder_text = "Captured editor context"
	dock.add_child(context_view)

	output_view = TextEdit.new()
	output_view.editable = false
	output_view.custom_minimum_size = Vector2(0, 200)
	output_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	output_view.placeholder_text = "Latest RPC output"
	dock.add_child(output_view)

	var stderr_label := Label.new()
	stderr_label.text = "Stderr"
	dock.add_child(stderr_label)

	stderr_view = TextEdit.new()
	stderr_view.editable = false
	stderr_view.custom_minimum_size = Vector2(0, 120)
	stderr_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stderr_view.placeholder_text = "Latest process stderr"
	dock.add_child(stderr_view)

	history_view = TextEdit.new()
	history_view.editable = false
	history_view.custom_minimum_size = Vector2(0, 160)
	history_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	history_view.placeholder_text = "Saved RPC history"
	dock.add_child(history_view)

func _on_capture_pressed() -> void:
	var context := _capture_editor_context()
	context_view.text = JSON.stringify(context, "\t")
	_run_rpc("editor.context", PackedStringArray(["--context", JSON.stringify(context)]), context)

func _on_status_pressed() -> void:
	_run_rpc("workspace.status")

func _on_inspect_pressed() -> void:
	_run_rpc("project.inspect")

func _on_validate_pressed() -> void:
	_run_rpc("validation.run")

func _on_scene_pressed() -> void:
	_run_rpc("validation.scene")

func _on_explain_pressed() -> void:
	_run_rpc("editor.explain")

func _on_review_pressed() -> void:
	_run_rpc("workspace.changes")

func _on_debug_pressed() -> void:
	_run_rpc("debug.current", PackedStringArray(["--error", error_field.text]))

func _on_preview_pressed() -> void:
	_run_rpc("build.preview", PackedStringArray(["--prompt", prompt_field.text]))

func _on_run_pressed() -> void:
	var method := method_picker.get_item_text(method_picker.selected)
	var extra := PackedStringArray()
	if method == "docs.search":
		extra.append_array(["--query", query_field.text])
	elif method == "build.preview":
		extra.append_array(["--prompt", prompt_field.text])
	elif method == "debug.current":
		extra.append_array(["--error", error_field.text])
	_run_rpc(method, extra)

func _on_replay_last_pressed() -> void:
	if history.is_empty():
		output_view.text = "No RPC history to replay."
		return
	var last := history[history.size() - 1]
	_run_cli_args(str(last.get("method", "")), last.get("cli", "godotcoder"), last.get("args", []), last.get("context", null), true)

func _on_replay_selected_pressed() -> void:
	var selected := _selected_history_entry()
	if selected.is_empty():
		output_view.text = "No selected history entry to replay."
		return
	_run_cli_args(str(selected.get("method", "")), selected.get("cli", "godotcoder"), selected.get("args", []), selected.get("context", null), true)

func _on_clear_pressed() -> void:
	history.clear()
	_save_history()
	output_view.text = "RPC history cleared."
	stderr_view.text = ""
	status_view.text = "RPC history cleared."
	_refresh_history_view()

func _run_rpc(method: String, extra_args: PackedStringArray = PackedStringArray(), context: Variant = null) -> void:
	var cli := command_field.text.strip_edges()
	if cli.is_empty():
		cli = "godotcoder"

	var args := ["rpc", method, "--json"]
	var captured_context := context if context != null else _capture_editor_context()
	if method != "editor.context" and captured_context is Dictionary and not captured_context.is_empty():
		args.append_array(["--context", JSON.stringify(captured_context)])
	args.append_array(extra_args)
	_run_cli_args(method, cli, args, captured_context)

func _run_cli_args(method: String, cli: String, args: Array, context: Variant, append_history := true) -> void:
	var execution := _execute_cli(cli, args)
	var exit_code := int(execution.get("exit_code", -1))
	var stdout_text := str(execution.get("stdout", ""))
	var stderr_text := str(execution.get("stderr", ""))
	var command_line := str(execution.get("command_line", "%s %s" % [cli, " ".join(args)]))

	var envelope := _parse_envelope(stdout_text)
	if envelope.is_empty():
		output_view.text = _format_command_output(cli, args, exit_code, stdout_text)
	else:
		output_view.text = _format_envelope_output(cli, args, exit_code, envelope, stdout_text)
	stderr_view.text = _format_stderr_output(exit_code, stderr_text)
	status_view.text = _format_status_message(method, command_line, exit_code, stdout_text, stderr_text)
	if append_history:
		_append_history(method, cli, args, exit_code, stdout_text, stderr_text, context)
		_refresh_history_view()

func _append_history(method: String, cli: String, args: Array, exit_code: int, output: String, stderr: String, context: Variant) -> void:
	var entry := {
		"captured_at": Time.get_datetime_string_from_system(),
		"method": method,
		"cli": cli,
		"args": args,
		"exit_code": exit_code,
		"output": output,
		"stderr": stderr,
		"context": context,
	}
	history.append(entry)
	if history.size() > 25:
		history = history.slice(history.size() - 25, history.size())
	_save_history()

func _refresh_history_view() -> void:
	var lines: PackedStringArray = []
	if history_picker:
		history_picker.clear()
	for entry in history:
		var line := "%s | %s | exit=%s" % [entry.get("captured_at", ""), entry.get("method", ""), str(entry.get("exit_code", -1))]
		lines.append(line)
		if history_picker:
			history_picker.add_item(_history_label(entry))
	if history_picker and history_picker.item_count > 0:
		history_picker.select(history_picker.item_count - 1)
	history_view.text = "\n".join(lines)

func _selected_history_entry() -> Dictionary:
	if history.is_empty() or history_picker == null:
		return {}
	var index := history_picker.selected
	if index < 0 or index >= history.size():
		return {}
	var entry := history[index]
	if typeof(entry) != TYPE_DICTIONARY:
		return {}
	return entry

func _history_label(entry: Dictionary) -> String:
	var method := str(entry.get("method", ""))
	var stamp := str(entry.get("captured_at", ""))
	return "%s | %s" % [stamp, method]

func _parse_envelope(text: String) -> Dictionary:
	var parsed := JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	if not parsed.has("ok") or not parsed.has("method"):
		return {}
	return parsed

func _format_envelope_output(cli: String, args: Array, exit_code: int, envelope: Dictionary, raw: String) -> String:
	var lines: PackedStringArray = []
	lines.append("Command: %s %s" % [cli, " ".join(args)])
	lines.append("Exit: %s" % exit_code)
	lines.append("Envelope:")
	lines.append("  ok: %s" % str(envelope.get("ok", false)))
	lines.append("  method: %s" % str(envelope.get("method", "")))
	lines.append("  error: %s" % _jsonish(envelope.get("error", null)))
	lines.append("  diagnostics: %s" % _jsonish(envelope.get("diagnostics", [])))
	lines.append("  result: %s" % _jsonish(envelope.get("result", null)))
	var preview_summary := _preview_summary_text(envelope)
	if not preview_summary.is_empty():
		lines.append("")
		lines.append("Preview:")
		lines.append(preview_summary)
	lines.append("")
	lines.append("Raw:")
	lines.append(raw)
	return "\n".join(lines)

func _jsonish(value: Variant) -> String:
	var data := JSON.stringify(value, "\t")
	if typeof(data) == TYPE_STRING:
		return data
	return str(value)

func _preview_summary_text(envelope: Dictionary) -> String:
	var result := envelope.get("result", {})
	if typeof(result) != TYPE_DICTIONARY:
		return ""
	if not result.has("previewSummary"):
		return ""
	var summary = result.get("previewSummary", {})
	if typeof(summary) != TYPE_DICTIONARY:
		return ""
	var counts = summary.get("counts", {})
	var changed_paths = summary.get("changedPaths", [])
	var lines: PackedStringArray = []
	lines.append("  files: %s | create: %s | modify: %s | unchanged: %s" % [
		str(summary.get("fileCount", 0)),
		str(counts.get("create", 0) if typeof(counts) == TYPE_DICTIONARY else 0),
		str(counts.get("modify", 0) if typeof(counts) == TYPE_DICTIONARY else 0),
		str(counts.get("unchanged", 0) if typeof(counts) == TYPE_DICTIONARY else 0),
	])
	lines.append("  lines: +%s -%s" % [str(summary.get("addedLines", 0)), str(summary.get("removedLines", 0))])
	if typeof(changed_paths) == TYPE_ARRAY and not changed_paths.is_empty():
		lines.append("  changed:")
		for path in changed_paths:
			lines.append("    %s" % str(path))
	return "\n".join(lines)

func _capture_editor_context() -> Dictionary:
	var editor := get_editor_interface()
	var selection := editor.get_selection()
	var selected_nodes: Array = []
	if selection:
		for node in selection.get_selected_nodes():
			selected_nodes.append(_node_info(node))

	var scene_root := editor.get_edited_scene_root()
	var script_editor := editor.get_script_editor()
	var current_script := script_editor.get_current_script() if script_editor else null

	return {
		"captured_at": Time.get_datetime_string_from_system(),
		"current_path": editor.get_current_path(),
		"open_scenes": editor.get_open_scenes(),
		"selected_paths": editor.get_selected_paths(),
		"scene_root": _node_info(scene_root),
		"selected_nodes": selected_nodes,
		"current_script": _script_info(current_script),
	}

func _node_info(node: Node) -> Dictionary:
	if node == null:
		return {}
	return {
		"name": node.name,
		"class": node.get_class(),
		"path": str(node.get_path()),
	}

func _script_info(script: Script) -> Dictionary:
	if script == null:
		return {}
	return {
		"class": script.get_class(),
		"path": script.resource_path,
	}

func _ensure_storage_dir() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(HISTORY_DIR))

func _load_history() -> void:
	history = []
	if not FileAccess.file_exists(HISTORY_FILE):
		return
	var file := FileAccess.open(HISTORY_FILE, FileAccess.READ)
	if file == null:
		return
	var parsed := JSON.parse_string(file.get_as_text())
	if typeof(parsed) == TYPE_ARRAY:
		history = parsed

func _save_history() -> void:
	var file := FileAccess.open(HISTORY_FILE, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify(history, "\t"))

func _make_button(label_text: String, callback: String) -> Button:
	var button := Button.new()
	button.text = label_text
	button.pressed.connect(Callable(self, callback))
	return button

func _load_cli_path() -> String:
	var settings := EditorSettings.get_singleton()
	if settings and settings.has_setting(SETTINGS_CLI_PATH):
		var value := str(settings.get_setting(SETTINGS_CLI_PATH)).strip_edges()
		if not value.is_empty():
			return value
	return "godotcoder"

func _on_command_field_changed(value: String) -> void:
	var cli := value.strip_edges()
	if cli.is_empty():
		cli = "godotcoder"
	var settings := EditorSettings.get_singleton()
	if settings:
		settings.set_setting(SETTINGS_CLI_PATH, cli)
		settings.save()

func _execute_cli(cli: String, args: Array) -> Dictionary:
	_ensure_temp_dir()
	var stamp := "%s-%s-%s" % [str(OS.get_process_id()), str(Time.get_ticks_msec()), str(randi())]
	var stdout_path := ProjectSettings.globalize_path("%s/%s.stdout" % [TEMP_DIR, stamp])
	var stderr_path := ProjectSettings.globalize_path("%s/%s.stderr" % [TEMP_DIR, stamp])
	var command_line := _build_shell_command(cli, args)
	var shell_command := "%s 1>%s 2>%s" % [
		command_line,
		_shell_escape(stdout_path),
		_shell_escape(stderr_path),
	]
	var shell_output: Array = []
	var exit_code := OS.execute("sh", ["-lc", shell_command], shell_output, true)
	var stdout_text := _read_text_file(stdout_path)
	var stderr_text := _read_text_file(stderr_path)
	_cleanup_temp_file(stdout_path)
	_cleanup_temp_file(stderr_path)
	if exit_code != 0 and stdout_text.strip_edges().is_empty() and stderr_text.strip_edges().is_empty():
		stderr_text = "Command exited with code %s and produced no output." % exit_code
	return {
		"exit_code": exit_code,
		"stdout": stdout_text,
		"stderr": stderr_text,
		"command_line": command_line,
	}

func _build_shell_command(cli: String, args: Array) -> String:
	var parts: PackedStringArray = []
	parts.append(_shell_escape(cli))
	for arg in args:
		parts.append(_shell_escape(str(arg)))
	return " ".join(parts)

func _shell_escape(value: String) -> String:
	if value.is_empty():
		return "''"
	return "'" + value.replace("'", "'\"'\"'") + "'"

func _read_text_file(path: String) -> String:
	if not FileAccess.file_exists(path):
		return ""
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return ""
	return file.get_as_text()

func _cleanup_temp_file(path: String) -> void:
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)

func _ensure_temp_dir() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(TEMP_DIR))

func _format_command_output(cli: String, args: Array, exit_code: int, stdout_text: String) -> String:
	var lines: PackedStringArray = []
	lines.append("Command: %s %s" % [cli, " ".join(args)])
	lines.append("Exit: %s" % exit_code)
	lines.append("")
	lines.append(stdout_text)
	return "\n".join(lines)

func _format_stderr_output(exit_code: int, stderr_text: String) -> String:
	var text := stderr_text.strip_edges()
	if text.is_empty():
		return "Exit: %s\nNo stderr captured." % exit_code
	return "Exit: %s\n%s" % [exit_code, text]

func _format_status_message(method: String, command_line: String, exit_code: int, stdout_text: String, stderr_text: String) -> String:
	if exit_code == 0:
		return "%s via %s completed successfully." % [method, command_line]
	if stdout_text.strip_edges().is_empty() and stderr_text.strip_edges().is_empty():
		return "%s via %s failed without output." % [method, command_line]
	return "%s via %s exited with code %s." % [method, command_line, exit_code]

func _on_debugger_error(error_text: String) -> void:
	error_field.text = error_text
	status_view.text = "Captured runtime error. Click 'Debug' to repair."

func _on_debugger_warning(warning_text: String) -> void:
	if error_field.text.strip_edges().is_empty():
		error_field.text = warning_text
		status_view.text = "Captured warning. Click 'Debug' to investigate."

func _on_session_stopped() -> void:
	status_view.text = "Session stopped. Check captured errors."


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

