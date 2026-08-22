extends CharacterBody3D

signal arrived(actor_name: String)
signal speech_finished(actor_name: String)

const ARRIVE_EPSILON := 0.1
const SPEECH_CHARS_PER_SECOND := 14.0
const SPEECH_MIN_HOLD := 1.2
const SPEECH_MAX_HOLD := 12.0

@export var actor_name := "Actor"
@export var actor_type := "human"
@export var move_speed := 2.0
@export var base_color := Color(0.75, 0.75, 0.8)

var target_position := Vector3.ZERO
var is_moving := false
var current_line := ""
var speech_hold := 0.0
var pending_exit := false
var walk_phase := 0.0

var _tint_material: StandardMaterial3D

@onready var model: MeshInstance3D = $Model
@onready var subtitle: Label3D = $Subtitle
@onready var emotion_node: Node = $Emotion
@onready var brain: Node = $Brain
@onready var state_machine: Node = $StateMachine


func _ready() -> void:
	add_to_group("actors")
	target_position = global_transform.origin
	_tint_material = StandardMaterial3D.new()
	_tint_material.albedo_color = base_color
	model.material_override = _tint_material


func _physics_process(delta: float) -> void:
	if not is_moving:
		return
	var direction := target_position - global_position
	direction.y = 0.0
	if direction.length() < ARRIVE_EPSILON:
		global_position.x = target_position.x
		global_position.z = target_position.z
		is_moving = false
		walk_phase = 0.0
		_set_model_bob(0.0)
		if pending_exit:
			pending_exit = false
			state_machine.set_state(state_machine.State.EXITED)
			visible = false
			subtitle.text = ""
		else:
			state_machine.set_state(state_machine.State.IDLE)
		arrived.emit(actor_name)
	else:
		velocity = direction.normalized() * move_speed
		move_and_slide()
		walk_phase += delta * move_speed * 3.2
		_set_model_bob(absf(sin(walk_phase)) * 0.06)
		_face_direction(direction.normalized())


func _process(delta: float) -> void:
	if speech_hold > 0.0:
		speech_hold -= delta
		if speech_hold <= 0.0:
			subtitle.text = ""
			speech_finished.emit(actor_name)


func move_to(pos: Vector3) -> void:
	target_position = pos
	is_moving = true
	state_machine.set_state(state_machine.State.WALKING)


func face(target: Variant) -> void:
	var pos := _resolve_target(target)
	var dir := pos - global_position
	dir.y = 0.0
	if dir.length() > 0.01:
		_face_direction(dir.normalized())


func say(line: String) -> void:
	current_line = line
	speech_hold = clampf(line.length() / SPEECH_CHARS_PER_SECOND, SPEECH_MIN_HOLD, SPEECH_MAX_HOLD)
	subtitle.text = line
	print("%s: %s" % [actor_name, line])
	state_machine.set_state(state_machine.State.TALKING)


func say_prompt(prompt: String) -> void:
	brain.say_from_prompt(prompt)


func set_emotion(emotion: String, strength: float = 0.5) -> void:
	emotion_node.set_emotion(emotion, strength)


func gesture(anim_name: String) -> void:
	if has_node("AnimationTree"):
		$AnimationTree.set("parameters/gestures/current", anim_name)
		$AnimationTree.travel("gestures/" + anim_name)
		return
	var tw := create_tween()
	tw.tween_property(model, "position:y", model.position.y + 0.25, 0.15)
	tw.tween_property(model, "position:y", model.position.y, 0.3)


func play_facial(blend_name: String, strength: float) -> void:
	if has_node("AnimationTree"):
		$AnimationTree.set("parameters/facial_blends/%s/blend_amount" % blend_name, strength)


func apply_tint(tint: Color, strength: float) -> void:
	_tint_material.albedo_color = base_color.lerp(tint, strength * 0.65)


func is_settled() -> bool:
	return not is_moving and speech_hold <= 0.0


func perform(action: String, data: Variant) -> void:
	match action:
		"move_to":
			move_to(_unpack_vec(data, "pos"))
		"enter":
			move_to(_unpack_vec(data, "pos"))
		"exit":
			pending_exit = true
			move_to(_unpack_vec(data, "pos"))
			state_machine.set_state(state_machine.State.EXITING)
		"face":
			face(_unpack(data, "target", Vector3.ZERO))
		"say":
			say(str(_unpack(data, "line", "")))
		"say_prompt":
			say_prompt(str(_unpack(data, "prompt", "")))
		"set_emotion":
			set_emotion(str(_unpack(data, "emotion", "neutral")), float(_unpack(data, "intensity", 0.5)))
		"gesture":
			gesture(str(_unpack(data, "name", "wave")))
		_:
			push_warning("%s: unknown action '%s'" % [actor_name, action])


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
	if typeof(target) == TYPE_ARRAY and (target as Array).size() >= 3:
		return Vector3(target[0], target[1], target[2])
	for node in get_tree().get_nodes_in_group("actors"):
		if node.actor_name == str(target):
			return node.global_position
	return global_position + -global_transform.basis.z


func _face_direction(dir: Vector3) -> void:
	var yaw := atan2(dir.x, dir.z)
	rotation.y = lerp_angle(rotation.y, yaw, 0.25)


func _set_model_bob(offset: float) -> void:
	model.position.y = 0.85 + offset
