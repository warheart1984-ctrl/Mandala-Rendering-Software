extends Node

signal scene_finished(scene_id: String)
signal beat_fired(beat: Dictionary)

const SPECIAL_SYSTEM := "SYSTEM"
const SPECIAL_CAMERA := "CAMERA_MAIN"

@export_file("*.json") var episode_path := "res://scripts/ep_001.json"
@export var scene_index := 0

var episode := {}
var scene_id := ""
var world_id := ""
var beats: Array = []
var sim_time := 0.0
var beat_index := 0
var running := false

@onready var actor_manager: Node = get_node("../ActorManager")
@onready var recorder: Node = get_node("../Recorder")
@onready var transition: CanvasLayer = get_node_or_null("../SceneTransition")
@onready var camera_rig: Node3D = get_node_or_null("../CameraRig")


func load_episode(path := "") -> bool:
	if path.is_empty():
		path = episode_path
	var text := FileAccess.get_file_as_string(path)
	if text.is_empty():
		push_error("Director: cannot read episode file %s" % path)
		return false
	var data: Variant = JSON.parse_string(text)
	if typeof(data) != TYPE_DICTIONARY:
		push_error("Director: invalid episode JSON in %s" % path)
		return false
	episode = data
	select_scene(scene_index)
	print("Director: loaded '%s' (%d scenes)" % [str(episode.get("title", "?")), (episode.get("scenes", []) as Array).size()])
	return true


func select_scene(index: int) -> void:
	var scenes: Array = episode.get("scenes", [])
	if index < 0 or index >= scenes.size():
		push_error("Director: scene index %d out of range" % index)
		return
	scene_index = index
	var scene: Dictionary = scenes[index]
	scene_id = str(scene.get("scene_id", "untitled"))
	world_id = str(scene.get("world_id", "chamber_world_01"))
	beats = (scene.get("beats", []) as Array).duplicate()
	beats.sort_custom(func(a, b): return float(a.get("time", 0.0)) < float(b.get("time", 0.0)))
	sim_time = 0.0
	beat_index = 0
	running = false


func push_beats(new_beats: Array) -> void:
	beats = new_beats.duplicate()
	beats.sort_custom(func(a, b): return float(a.get("time", 0.0)) < float(b.get("time", 0.0)))


func start() -> void:
	running = true
	recorder.begin(self)
	print("Director: rolling scene '%s'" % scene_id)


func stop() -> void:
	running = false


func _process(delta: float) -> void:
	if not running or beats.is_empty():
		return
	sim_time += delta
	while beat_index < beats.size() and sim_time >= float(beats[beat_index].get("time", 0.0)):
		_run_beat(beats[beat_index])
		beat_index += 1
	if beat_index >= beats.size() and _all_settled():
		_finish()


func _run_beat(beat: Dictionary) -> void:
	var who := str(beat.get("actor", SPECIAL_SYSTEM))
	var action := str(beat.get("action", ""))
	var data: Variant = _resolve_data(action, beat.get("data", {}))
	recorder.record_event({"sim_time": sim_time, "type": "beat", "actor": who, "action": action, "data": beat.get("data", {})})
	beat_fired.emit(beat)
	match who:
		SPECIAL_SYSTEM:
			_system_action(action, data)
		SPECIAL_CAMERA:
			_camera_action(action, data)
		_:
			var actor = actor_manager.get_actor(who)
			if actor == null:
				push_warning("Director: unknown actor '%s'" % who)
				return
			actor.perform(action, data)


func _system_action(action: String, data: Variant) -> void:
	match action:
		"transition":
			var type_name := str(_unpack(data, "type", "fade_out"))
			var duration := float(_unpack(data, "duration", 1.0))
			if transition == null:
				return
			if type_name == "fade_out":
				transition.fade_out(duration)
			else:
				transition.fade_in(duration)
		"end":
			_finish()
		_:
			push_warning("Director: unknown SYSTEM action '%s'" % action)


func _camera_action(action: String, data: Variant) -> void:
	if camera_rig == null:
		return
	match action:
		"rail":
			camera_rig.start_rail(str(_unpack(data, "path", "")), float(_unpack(data, "speed", 1.0)))
		"cut":
			camera_rig.cut_to(_as_vec(_unpack(data, "pos", [0.0, 2.4, 6.5])), _as_vec(_unpack(data, "look_at", [0.0, 1.0, 0.0])))
		"stop":
			camera_rig.stop_path()
		_:
			push_warning("Director: unknown CAMERA action '%s'" % action)


func _all_settled() -> bool:
	for a in get_tree().get_nodes_in_group("actors"):
		if not a.is_settled():
			return false
	return true


func _finish() -> void:
	if not running:
		return
	running = false
	var path: String = recorder.save_log("")
	print("Director: scene '%s' complete in %.1fs sim time" % [scene_id, sim_time])
	scene_finished.emit(scene_id)


func _resolve_data(action: String, data: Variant) -> Variant:
	if typeof(data) != TYPE_DICTIONARY:
		if action in ["move_to", "enter", "exit"]:
			return {"pos": data}
		return data
	if data.has("pos") and typeof(data.pos) == TYPE_ARRAY:
		var copy: Dictionary = data.duplicate()
		copy["pos"] = _as_vec(data.pos)
		return copy
	return data


func _unpack(data: Variant, key: String, fallback: Variant) -> Variant:
	if typeof(data) == TYPE_DICTIONARY:
		return data.get(key, fallback)
	return fallback


func _as_vec(v: Variant) -> Vector3:
	if typeof(v) == TYPE_VECTOR3:
		return v
	if typeof(v) == TYPE_ARRAY and (v as Array).size() >= 3:
		return Vector3(float(v[0]), float(v[1]), float(v[2]))
	return Vector3.ZERO
