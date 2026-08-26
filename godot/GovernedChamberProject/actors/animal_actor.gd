extends Node3D

signal arrived(actor_name: String)
signal speech_finished(actor_name: String)

const ARRIVE_EPSILON := 0.15
const SPEECH_MIN_HOLD := 0.8

@export var actor_name := "Animal"
@export var actor_type := "animal"
@export var species := "dog"
@export var move_speed := 2.4
@export var base_color := Color(0.6, 0.45, 0.3)

var target_position := Vector3.ZERO
var is_moving := false
var current_line := ""
var speech_hold := 0.0
var pending_exit := false

var _tint_material: StandardMaterial3D

@onready var model: MeshInstance3D = $Model
@onready var tail: MeshInstance3D = $Tail
@onready var subtitle: Label3D = $Subtitle
@onready var emotion_node: Node = $Emotion
@onready var brain: Node = $Brain
@onready var state_machine: Node = $StateMachine
@onready var nav_agent: NavigationAgent3D = $NavigationAgent3D


func _ready() -> void:
	add_to_group("actors")
	target_position = global_position
	_tint_material = StandardMaterial3D.new()
	_tint_material.albedo_color = base_color
	model.material_override = _tint_material
	tail.material_override = _tint_material


func _physics_process(delta: float) -> void:
	if is_moving:
		if nav_agent.is_navigation_finished():
			is_moving = false
			if pending_exit:
				pending_exit = false
				state_machine.set_state(state_machine.State.EXITED)
				visible = false
				subtitle.text = ""
			else:
				state_machine.set_state(state_machine.State.IDLE)
			arrived.emit(actor_name)
		else:
			var next := nav_agent.get_next_path_position()
			global_position = global_position.move_toward(next, delta * move_speed)
			face(next)
	if speech_hold > 0.0:
		speech_hold -= delta * 1.6
		tail.rotation.y = sin(Time.get_ticks_msec() * 0.02) * 0.5
		if speech_hold <= 0.0:
			speech_hold = 0.0
			tail.rotation.y = 0.0
			subtitle.text = ""
			state_machine.set_state(state_machine.State.IDLE)
			speech_finished.emit(actor_name)


func move_to(pos: Vector3) -> void:
	target_position = pos
	is_moving = true
	nav_agent.target_position = pos
	state_machine.set_state(state_machine.State.WALKING)


func face(target: Variant) -> void:
	var pos := _resolve_target(target)
	var dir := pos - global_position
	dir.y = 0.0
	if dir.length() > 0.05:
		var yaw := atan2(dir.x, dir.z)
		rotation.y = lerp_angle(rotation.y, yaw, 0.2)


func say(line: String) -> void:
	current_line = line
	speech_hold = maxf(SPEECH_MIN_HOLD, line.length() * 0.04)
	subtitle.text = "%s (%s)" % [line, species]
	print("%s (%s): %s" % [actor_name, species, line])
	state_machine.set_state(state_machine.State.TALKING)


func say_prompt(prompt: String) -> void:
	say(brain.generate_line(prompt))


func set_emotion(emotion: String, strength: float = 0.5) -> void:
	emotion_node.set_emotion(emotion, strength)


func gesture(anim_name: String) -> void:
	var tw := create_tween()
	tw.tween_property(tail, "rotation:x", -0.8, 0.18)
	tw.tween_property(tail, "rotation:x", 0.0, 0.3)


func play_facial(_blend_name: String, _strength: float) -> void:
	pass


func apply_tint(tint: Color, strength: float) -> void:
	_tint_material.albedo_color = base_color.lerp(tint, strength * 0.65)


func is_settled() -> bool:
	return not is_moving and speech_hold <= 0.0


func perform(action: String, data: Variant) -> void:
	match action:
		"move_to", "enter":
			move_to(_unpack_vec(data, "pos"))
		"exit":
			pending_exit = true
			move_to(_unpack_vec(data, "pos"))
			state_machine.set_state(state_machine.State.EXITING)
		"face":
			face(_unpack(data, "target", null))
		"say":
			say(str(_unpack(data, "line", "")))
		"say_prompt":
			say_prompt(str(_unpack(data, "prompt", "")))
		"set_emotion":
			set_emotion(str(_unpack(data, "emotion", "neutral")), float(_unpack(data, "intensity", 0.5)))
		"gesture":
			gesture(str(_unpack(data, "name", "wag")))
		_:
			push_warning("%s: unknown animal action '%s'" % [actor_name, action])


func _unpack(data: Variant, key: String, fallback: Variant) -> Variant:
	if typeof(data) == TYPE_DICTIONARY:
		return data.get(key, fallback)
	return data


func _unpack_vec(data: Variant, key: String) -> Vector3:
	var v := _unpack(data, key, null)
	if typeof(v) == TYPE_VECTOR3:
		return v
	if typeof(v) == TYPE_ARRAY and (v as Array).size() >= 3:
		return Vector3(v[0], v[1], v[2])
	push_warning("%s: bad vector in beat data" % actor_name)
	return global_position


func _resolve_target(target: Variant) -> Vector3:
	if typeof(target) == TYPE_VECTOR3:
		return target
	for node in get_tree().get_nodes_in_group("actors"):
		if node.actor_name == str(target):
			return node.global_position
	return global_position + -global_transform.basis.z
