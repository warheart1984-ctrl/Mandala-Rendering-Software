extends Node3D

const ROOM_HALF := 7.0

var paused := false
var last_time_scale := 1.0

@onready var director: Node = $Director
@onready var recorder: Node = $Recorder
@onready var camera_rig: Node3D = $CameraRig


func _ready() -> void:
	_setup_environment()
	_build_room()
	director.scene_finished.connect(_on_scene_finished)
	if camera_rig.mode == "rail":
		camera_rig.start_rail("", 1.0)
	print("[Chamber] Controls: SPACE pause | 1/2/3 speed 25/50/100%% | R restart")
	print("[Chamber] Starting episode...")
	call_deferred("_start_director")


func _start_director() -> void:
	if director.load_episode(director.episode_path):
		director.start()


func _on_scene_finished(_scene_id: String) -> void:
	recorder.save_log("")


func _unhandled_key_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo:
		return
	match key.keycode:
		KEY_SPACE:
			_toggle_pause()
		KEY_1:
			_set_time_scale(0.25)
		KEY_2:
			_set_time_scale(0.5)
		KEY_3:
			_set_time_scale(1.0)
		KEY_R:
			get_tree().reload_current_scene()


func _toggle_pause() -> void:
	paused = not paused
	Engine.time_scale = 0.0 if paused else last_time_scale
	print("[Chamber] %s" % ("PAUSED" if paused else "PLAYING"))


func _set_time_scale(value: float) -> void:
	last_time_scale = value
	paused = false
	Engine.time_scale = value
	print("[Chamber] time scale %.2f" % value)


func _setup_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.04, 0.05, 0.07)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.6, 0.65, 0.78)
	env.ambient_light_energy = 0.55
	($WorldEnvironment as WorldEnvironment).environment = env

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52.0, -28.0, 0.0)
	sun.light_energy = 1.1
	sun.shadow_enabled = true
	add_child(sun)

	var fill := OmniLight3D.new()
	fill.position = Vector3(0.0, 4.5, 0.0)
	fill.omni_range = 14.0
	fill.light_energy = 0.45
	fill.light_color = Color(0.85, 0.9, 1.0)
	add_child(fill)


func _build_room() -> void:
	var level := $Level

	var floor_body := StaticBody3D.new()
	level.add_child(floor_body)
	var floor_shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(ROOM_HALF * 2.0, 0.2, ROOM_HALF * 2.0)
	floor_shape.shape = box
	floor_shape.position.y = -0.1
	floor_body.add_child(floor_shape)

	var floor_mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(ROOM_HALF * 2.0, ROOM_HALF * 2.0)
	floor_mesh.mesh = plane
	floor_mesh.material_override = _flat_material(Color(0.16, 0.17, 0.2))
	level.add_child(floor_mesh)

	var grid := MeshInstance3D.new()
	var inner := PlaneMesh.new()
	inner.size = Vector2(ROOM_HALF * 1.6, ROOM_HALF * 1.6)
	grid.mesh = inner
	grid.position.y = 0.005
	grid.material_override = _flat_material(Color(0.19, 0.21, 0.26))
	level.add_child(grid)

	for i in 4:
		var wall := MeshInstance3D.new()
		var wall_box := BoxMesh.new()
		var along_x := i % 2 == 0
		wall_box.size = Vector3(ROOM_HALF * 2.0 + 0.3, 3.0, 0.3) if along_x else Vector3(0.3, 3.0, ROOM_HALF * 2.0 + 0.3)
		wall.mesh = wall_box
		var offset := (ROOM_HALF + 0.15) * (1.0 if i < 2 else -1.0)
		wall.position = Vector3(0.0, 1.5, offset) if along_x else Vector3(offset, 1.5, 0.0)
		wall.material_override = _flat_material(Color(0.11, 0.12, 0.15))
		level.add_child(wall)


func _flat_material(color: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.9
	return mat
