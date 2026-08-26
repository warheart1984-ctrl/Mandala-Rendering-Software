extends Node

signal actor_registered(actor_name: String)

const DEFAULT_ACTOR_SCENE := "res://scenes/actors/actor.tscn"
const DEFAULT_ANIMAL_SCENE := "res://scenes/actors/animal_actor.tscn"

var actors := {}


func _ready() -> void:
	call_deferred("_scan_group")


func _scan_group() -> void:
	for node in get_tree().get_nodes_in_group("actors"):
		register_actor(node)


func register_actor(actor: Node) -> void:
	actors[actor.actor_name] = actor
	actor_registered.emit(actor.actor_name)


func get_actor(name: String) -> Node:
	return actors.get(name, null)


func spawn_actor(id: String, pos: Vector3, kind := "human") -> Node:
	if actors.has(id):
		return actors[id]
	var path := DEFAULT_ANIMAL_SCENE if kind == "animal" else DEFAULT_ACTOR_SCENE
	var packed: PackedScene = load(path)
	if packed == null:
		push_error("ActorManager: missing scene %s" % path)
		return null
	var actor := packed.instantiate()
	actor.name = id
	actor.actor_name = id
	add_child(actor)
	actor.global_position = pos
	register_actor(actor)
	return actor


func list_actors() -> Array:
	var out: Array = []
	for id in actors:
		var a: Node = actors[id]
		out.append({
			"name": id,
			"type": str(a.actor_type),
			"position": [a.global_position.x, a.global_position.y, a.global_position.z],
		})
	return out
