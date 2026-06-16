@tool
extends EditorPlugin

const DOCK_SCENE := preload("res://addons/godotcoder/dock.tscn")
var dock_instance: Control

func _enter_tree() -> void:
	dock_instance = DOCK_SCENE.instantiate()
	if dock_instance.has_method("setup"):
		dock_instance.setup(get_editor_interface())
	add_control_to_bottom_panel(dock_instance, "GodotCoder")

func _exit_tree() -> void:
	if dock_instance:
		remove_control_from_bottom_panel(dock_instance)
		dock_instance.queue_free()
