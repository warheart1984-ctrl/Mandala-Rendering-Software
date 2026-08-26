extends EditorPlugin

var panel: Control


func _enter_tree() -> void:
	panel = preload("res://addons/holodeck_plugin/EpisodePanel.tscn").instantiate()
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, panel)
	panel.plugin = self


func _exit_tree() -> void:
	remove_control_from_docks(panel)
	panel.queue_free()
