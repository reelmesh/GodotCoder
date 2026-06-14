@tool
extends EditorPlugin

const RPC_METHODS := [
	"workspace.status",
	"project.inspect",
	"runtime.doctor",
	"validation.run",
	"docs.search",
	"build.preview",
]

var dock: VBoxContainer
var method_picker: OptionButton
var output_view: TextEdit
var query_field: LineEdit
var prompt_field: LineEdit
var command_field: LineEdit

func _enter_tree() -> void:
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

	query_field = LineEdit.new()
	query_field.placeholder_text = "docs.search query"
	dock.add_child(query_field)

	prompt_field = LineEdit.new()
	prompt_field.placeholder_text = "build.preview prompt"
	dock.add_child(prompt_field)

	command_field = LineEdit.new()
	command_field.placeholder_text = "godotcoder command (defaults to godotcoder)"
	command_field.text = "godotcoder"
	dock.add_child(command_field)

	var buttons := HBoxContainer.new()
	buttons.add_child(_make_button("Status", "_on_status_pressed"))
	buttons.add_child(_make_button("Inspect", "_on_inspect_pressed"))
	buttons.add_child(_make_button("Validate", "_on_validate_pressed"))
	buttons.add_child(_make_button("Run", "_on_run_pressed"))
	dock.add_child(buttons)

	output_view = TextEdit.new()
	output_view.editable = false
	output_view.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	output_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	dock.add_child(output_view)

	add_control_to_dock(DOCK_SLOT_RIGHT_UL, dock)

func _exit_tree() -> void:
	if dock:
		remove_control_from_docks(dock)
		dock.queue_free()

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

func _run_rpc(method: String, extra_args: PackedStringArray = PackedStringArray()) -> void:
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

func _make_button(label_text: String, callback: String) -> Button:
	var button := Button.new()
	button.text = label_text
	button.pressed.connect(Callable(self, callback))
	return button
