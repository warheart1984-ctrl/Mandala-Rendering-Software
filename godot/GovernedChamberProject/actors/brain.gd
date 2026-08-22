extends Node

@export var personality := "neutral"
@export var context := ""

var provider: DialogueProvider


func _ready() -> void:
	provider = DialogueProvider.create()
	add_child(provider)


func generate_line(prompt: String) -> String:
	return provider.generate_line(prompt, {"personality": personality, "context": context})


func say_from_prompt(prompt: String) -> void:
	get_parent().say(generate_line(prompt))
