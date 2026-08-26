extends Node3D

@export var mode := "rail"
@export var speed := 0.12
@export var look_target := Vector3(0.0, 1.0, 0.0)

var t := 0.0
var railing := false

@onready var cam: Camera3D = $Camera3D
@onready var path3d: Path3D = $Path3D


func _ready() -> void:
	cam.current = true
	cam.look_at_from_position(cam.global_position, look_target)
	if mode == "rail" and path3d.curve != null and path3d.curve.point_count == 0:
		_build_default_arc()


func start_rail(path_scene_path := "", rail_speed := 1.0) -> void:
	if not path_scene_path.is_empty():
		var packed: PackedScene = load(path_scene_path)
		if packed != null:
			var custom := packed.instantiate()
			add_child(custom)
			path3d = custom if custom is Path3D else path3d.get_node_or_null("Path3D")
	if path3d == null or path3d.curve == null or path3d.curve.point_count == 0:
		push_warning("CameraRig: no rail curve, staying static")
		return
	speed = maxf(rail_speed * 0.12, 0.01)
	t = 0.0
	railing = true


func stop_path() -> void:
	railing = false


func cut_to(pos: Vector3, look_at_point: Vector3) -> void:
	stop_path()
	cam.global_position = pos
	cam.look_at(look_at_point)


func _process(delta: float) -> void:
	if not railing or path3d == null or path3d.curve == null:
		return
	var length := path3d.curve.get_baked_length()
	if length <= 0.0:
		return
	t += delta * speed * length
	cam.global_position = path3d.curve.sample_baked(fmod(t, length))
	cam.look_at(look_target)


func _build_default_arc() -> void:
	var curve := Curve3D.new()
	curve.add_point(Vector3(-2.6, 2.0, 6.4))
	curve.add_point(Vector3(0.0, 2.3, 5.6))
	curve.add_point(Vector3(2.6, 2.0, 6.4))
	path3d.curve = curve
