extends Node

const SAMPLE_INTERVAL := 0.1

var recording := false
var events: Array = []
var frames: Array = []
var scene_id := "untitled"
var world_id := "chamber_world_01"
var episode_title := ""
var sim_time := 0.0

var _accum := 0.0


func begin(director: Node) -> void:
	recording = true
	events.clear()
	frames.clear()
	_accum = 0.0
	sim_time = 0.0
	scene_id = str(director.scene_id)
	world_id = str(director.world_id)
	episode_title = str(director.episode.get("title", ""))
	record_event({"type": "session_start", "scene_id": scene_id})


func record_event(event: Dictionary) -> void:
	if not recording:
		return
	event["sim_time"] = event.get("sim_time", snappedf(sim_time, 0.001))
	events.append(event)


func _process(delta: float) -> void:
	if not recording:
		return
	sim_time += delta
	_accum += delta
	if _accum < SAMPLE_INTERVAL:
		return
	_accum = 0.0
	var frame := {"time": snappedf(sim_time, 0.001)}
	var cam := get_node_or_null("../CameraRig/Camera3D") as Camera3D
	if cam != null:
		var p := cam.global_position
		frame["cam_pos"] = [p.x, p.y, p.z]
		frame["cam_rot"] = [cam.global_rotation.x, cam.global_rotation.y, cam.global_rotation.z]
		frame["cam_fov"] = cam.fov
	for a: Node in get_tree().get_nodes_in_group("actors"):
		var pos: Vector3 = a.global_position
		frame[str(a.actor_name)] = {
			"pos": [snappedf(pos.x, 0.001), snappedf(pos.y, 0.001), snappedf(pos.z, 0.001)],
			"moving": a.is_moving,
			"emotion": str(a.emotion_node.current_emotion),
		}
	frames.append(frame)


func save_log(path := "") -> String:
	recording = false
	if path.is_empty():
		DirAccess.open("user://").make_dir_recursive("recordings")
		path = "user://recordings/%s_%d.json" % [scene_id, Time.get_ticks_msec()]
	var payload := {
		"world_id": world_id,
		"scene_id": scene_id,
		"episode": episode_title,
		"duration_sim_seconds": snappedf(sim_time, 0.001),
		"engine": Engine.get_version_info().string,
		"events": events,
		"frames": frames,
	}
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		push_error("Recorder: cannot write %s" % path)
		return ""
	file.store_string(JSON.stringify(payload, "\t"))
	file.close()
	print("[Recorder] %d events, %d frames -> %s" % [events.size(), frames.size(), ProjectSettings.globalize_path(path)])
	return path
