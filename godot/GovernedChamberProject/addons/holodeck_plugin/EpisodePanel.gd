extends Control

var plugin: EditorPlugin
var episode_data := {}
var current_scene_index := -1

@onready var load_button: Button = $VBoxContainer/LoadButton
@onready var scene_list: ItemList = $VBoxContainer/SceneList
@onready var beat_list: ItemList = $VBoxContainer/BeatList
@onready var push_button: Button = $VBoxContainer/PushToDirectorButton
@onready var actor_browser: ItemList = $VBoxContainer/ActorBrowser
@onready var refresh_actors_button: Button = $VBoxContainer/RefreshActorsButton


func _ready() -> void:
	load_button.pressed.connect(_on_load_pressed)
	scene_list.item_selected.connect(_on_scene_selected)
	push_button.pressed.connect(_on_push_pressed)
	refresh_actors_button.pressed.connect(_refresh_actor_browser)


func _on_load_pressed() -> void:
	var file_dialog := FileDialog.new()
	file_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	file_dialog.access = FileDialog.ACCESS_FILESYSTEM
	file_dialog.filters = PackedStringArray(["*.json"])
	add_child(file_dialog)
	file_dialog.popup_centered(Vector2i(720, 480))
	file_dialog.file_selected.connect(_on_episode_file_selected)


func _on_episode_file_selected(path: String) -> void:
	var text := FileAccess.get_file_as_string(path)
	if text.is_empty():
		push_error("Invalid JSON: cannot read %s" % path)
		return
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Invalid JSON: %s" % path)
		return
	episode_data = parsed
	current_scene_index = -1
	scene_list.clear()
	beat_list.clear()
	for scene in episode_data.get("scenes", []):
		scene_list.add_item(str(scene.get("scene_id", "?")))
	print("EpisodePanel: loaded '%s' (%d scenes)" % [str(episode_data.get("title", "?")), scene_list.item_count])


func _on_scene_selected(index: int) -> void:
	current_scene_index = index
	beat_list.clear()
	if index < 0 or index >= (episode_data.get("scenes", []) as Array).size():
		return
	var scene: Dictionary = episode_data["scenes"][index]
	for beat in scene.get("beats", []):
		beat_list.add_item("%6.1fs  %-12s %-12s %s" % [
			float(beat.get("time", 0.0)),
			str(beat.get("actor", "")),
			str(beat.get("action", "")),
			str(beat.get("data", {})),
		])


func _on_push_pressed() -> void:
	if current_scene_index == -1:
		push_error("No scene selected")
		return
	var director := _find_director()
	if director == null:
		push_error("Director node not found in current scene")
		return
	var beats: Array = episode_data["scenes"][current_scene_index].get("beats", [])
	if director.has_method("push_beats"):
		director.push_beats(beats)
	else:
		director.set("script_beats", beats)
	print("Beats pushed to Director")


func _refresh_actor_browser() -> void:
	actor_browser.clear()
	var root := get_tree().edited_scene_root
	if root == null:
		return
	for node in _find_actor_nodes(root):
		actor_browser.add_item("%s  [%s]  emotion=%s" % [
			str(node.actor_name),
			str(node.actor_type),
			str(node.emotion_node.current_emotion) if node.get_node_or_null("Emotion") else "n/a",
		])


func _find_director() -> Node:
	var root := get_tree().edited_scene_root
	if root == null:
		return null
	return root.get_node_or_null("Director")


func _find_actor_nodes(node: Node) -> Array:
	var found: Array = []
	for child in node.get_children():
		if "actor_name" in child:
			found.append(child)
		found.append_array(_find_actor_nodes(child))
	return found
