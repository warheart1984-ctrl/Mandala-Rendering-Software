extends Node

@export_file("*.json") var episode_path := "res://scripts/ep_001.json"

var scenes: Array = []
var current := -1
var current_instance: Node = null


func _ready() -> void:
	var text := FileAccess.get_file_as_string(episode_path)
	var data: Variant = JSON.parse_string(text)
	if typeof(data) == TYPE_DICTIONARY:
		scenes = data.get("scenes", [])


func start_episode() -> void:
	current = -1
	next_scene()


func next_scene() -> void:
	current += 1
	if current >= scenes.size():
		print("EpisodeRunner: episode complete")
		return
	load_scene(current)


func restart_episode() -> void:
	start_episode()


func load_scene(index: int) -> void:
	if current_instance != null:
		current_instance.queue_free()
		current_instance = null
	var scene_def: Dictionary = scenes[index]
	var path := str(scene_def.get("scene_path", ""))
	if path.is_empty():
		push_warning("EpisodeRunner: scene '%s' has no scene_path" % str(scene_def.get("scene_id", "?")))
		return
	var packed: PackedScene = load(path)
	if packed == null:
		push_error("EpisodeRunner: cannot load %s" % path)
		return
	current_instance = packed.instantiate()
	get_tree().root.add_child(current_instance)
