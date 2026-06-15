@tool
extends EditorPlugin

const HISTORY_DIR := "user://godotcoder"
const HISTORY_FILE := HISTORY_DIR + "/plugin-history.json"
const RPC_METHODS := [
	"workspace.status",
	"project.inspect",
	"runtime.doctor",
	"validation.run",
	"docs.search",
	"build.preview",
	"editor.context",
]

var dock: VBoxContainer
var method_picker: OptionButton
var output_view: TextEdit
var context_view: TextEdit
var history_view: TextEdit
var query_field: LineEdit
var prompt_field: LineEdit
var command_field: LineEdit
var history: Array = []

func _enter_tree() -> void:
	_ensure_storage_dir()
	_load_history()
	_build_dock()
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, dock)
	_refresh_history_view()

func _exit_tree() -> void:
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
	command_field.placeholder_text = "godotcoder command"
	command_field.text = "godotcoder"
	dock.add_child(command_field)

	query_field = LineEdit.new()
	query_field.placeholder_text = "docs.search query"
	dock.add_child(query_field)

	prompt_field = LineEdit.new()
	prompt_field.placeholder_text = "build.preview prompt"
	dock.add_child(prompt_field)

	var buttons := HBoxContainer.new()
	buttons.add_child(_make_button("Capture", "_on_capture_pressed"))
	buttons.add_child(_make_button("Status", "_on_status_pressed"))
	buttons.add_child(_make_button("Inspect", "_on_inspect_pressed"))
	buttons.add_child(_make_button("Validate", "_on_validate_pressed"))
	buttons.add_child(_make_button("Run", "_on_run_pressed"))
	dock.add_child(buttons)

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

	history_view = TextEdit.new()
	history_view.editable = false
	history_view.custom_minimum_size = Vector2(0, 160)
	history_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	history_view.placeholder_text = "Saved RPC history"
	dock.add_child(history_view)

func _on_capture_pressed() -> void:
	var context := _capture_editor_context()
	context_view.text = JSON.stringify(context, "\t")
	_run_rpc("editor.context", ["--context", JSON.stringify(context)], context)

func _on_status_pressed() -> void:
	_run_rpc("workspace.status")

func _on_inspect_pressed() -> void:
	_run_rpc("project.inspect")

func _on_validate_pressed() -> void:
	_run_rpc("validation.run")

func _on_run_pressed() -> void:
	var method := method_picker.get_item_text(method_picker.selected)
	var extra := PackedStringArray()
	if method == "docs.search":
		extra.append_array(["--query", query_field.text])
	elif method == "build.preview":
		extra.append_array(["--prompt", prompt_field.text])
	_run_rpc(method, extra)

func _run_rpc(method: String, extra_args: PackedStringArray = PackedStringArray(), context: Variant = null) -> void:
	var cli := command_field.text.strip_edges()
	if cli.is_empty():
		cli = "godotcoder"

	var args := ["rpc", method, "--json"]
	args.append_array(extra_args)

	var output: Array = []
	var exit_code := OS.execute(cli, args, output, true)
	var text := ""
	if output.size() > 0:
		text = str(output[0])

	output_view.text = "Command: %s %s\nExit: %s\n\n%s" % [cli, " ".join(args), exit_code, text]
	_append_history(method, cli, args, exit_code, text, context)
	_refresh_history_view()

func _append_history(method: String, cli: String, args: Array, exit_code: int, output: String, context: Variant) -> void:
	var entry := {
		"captured_at": Time.get_datetime_string_from_system(),
		"method": method,
		"cli": cli,
		"args": args,
		"exit_code": exit_code,
		"output": output,
		"context": context,
	}
	history.append(entry)
	if history.size() > 25:
		history = history.slice(history.size() - 25, history.size())
	_save_history()

func _refresh_history_view() -> void:
	var lines: PackedStringArray = []
	for entry in history:
		var line := "%s | %s | exit=%s" % [entry.get("captured_at", ""), entry.get("method", ""), str(entry.get("exit_code", -1))]
		lines.append(line)
	history_view.text = "\n".join(lines)

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
