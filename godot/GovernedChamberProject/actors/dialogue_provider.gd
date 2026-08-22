class_name DialogueProvider
extends Node


static func create() -> DialogueProvider:
	if OS.get_environment("CHAMBER_DIALOGUE_PROVIDER").to_lower() == "llm":
		return LLMDialogueProvider.new()
	return DialogueProvider.new()


func generate_line(prompt: String, ctx: Dictionary = {}) -> String:
	var personality: String = str(ctx.get("personality", "neutral"))
	var prefix := "" if personality == "neutral" else "[%s] " % personality
	return "%s%s." % [prefix, prompt.strip_edges().capitalize()]
