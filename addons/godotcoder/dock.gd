@tool
extends VBoxContainer

@onready var status_btn: Button = $Toolbar/StatusBtn
@onready var validate_btn: Button = $Toolbar/ValidateBtn
@onready var inspect_btn: Button = $Toolbar/InspectBtn
@onready var output_area: RichTextLabel = $OutputArea
@onready var prompt_input: LineEdit = $PromptBar/PromptInput
@onready var send_btn: Button = $PromptBar/SendBtn

var editor_interface: EditorInterface

func setup(p_interface: EditorInterface) -> void:
	editor_interface = p_interface

func _ready() -> void:
	status_btn.pressed.connect(_on_status_pressed)
	validate_btn.pressed.connect(_on_validate_pressed)
	inspect_btn.pressed.connect(_on_inspect_pressed)
	send_btn.pressed.connect(_on_send_pressed)
	prompt_input.text_submitted.connect(_on_prompt_submitted)

func _on_status_pressed() -> void:
	_run_cli_command("status", [])

func _on_validate_pressed() -> void:
	_run_cli_command("validate", [])

func _on_inspect_pressed() -> void:
	_run_cli_command("inspect", [])

func _on_prompt_submitted(_text: String) -> void:
	_on_send_pressed()

func _on_send_pressed() -> void:
	var prompt := prompt_input.text.trim()
	if prompt.is_empty():
		return
	prompt_input.text = ""
	_run_cli_command("ask", [prompt])

func _run_cli_command(command: String, args: Array) -> void:
	output_area.text = "[color=yellow]Running: godotcoder %s...[/color]\n" % command
	
	# Determine project root and absolute paths
	var project_path := ProjectSettings.globalize_path("res://")
	var cli_js_path := project_path + "dist/cli.js"
	
	# Build the execution arguments
	var execution_args := [cli_js_path, command]
	for arg in args:
		execution_args.append(arg)
	execution_args.append("--json")
	
	var output := []
	var exit_code := OS.execute("node", execution_args, output, true)
	
	if exit_code != 0:
		output_area.text += "[color=red]Command failed with exit code %d.[/color]\n" % exit_code
		if not output.is_empty():
			output_area.text += output[0]
		return
		
	if output.is_empty():
		output_area.text += "[color=red]No output returned from CLI tool.[/color]\n"
		return
		
	var result_text: String = output[0]
	output_area.text += "[color=green]Success![/color]\n"
	
	# Try parsing the JSON response
	var json = JSON.new()
	var err = json.parse(result_text)
	if err == OK:
		var data = json.get_data()
		output_area.text += JSON.stringify(data, "  ")
	else:
		output_area.text += result_text
