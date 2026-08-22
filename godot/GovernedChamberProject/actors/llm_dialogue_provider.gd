class_name LLMDialogueProvider
extends DialogueProvider

const DEFAULT_BASE_URL := "https://api.openai.com/v1"
const DEFAULT_MODEL := "gpt-4o-mini"
const SYSTEM_PROMPT := "You are an actor inside a simulated scene. Stay in character. Reply with one short spoken line only."

var api_key := ""
var base_url := DEFAULT_BASE_URL
var model := DEFAULT_MODEL


func _ready() -> void:
	api_key = OS.get_environment("CHAMBER_LLM_API_KEY")
	var env_base := OS.get_environment("CHAMBER_LLM_BASE_URL").strip_edges()
	if not env_base.is_empty():
		base_url = env_base.trim_suffix("/")
	var env_model := OS.get_environment("CHAMBER_LLM_MODEL").strip_edges()
	if not env_model.is_empty():
		model = env_model
	if api_key.is_empty():
		push_warning("LLMDialogueProvider: CHAMBER_LLM_API_KEY not set, falling back to scripted lines")


func generate_line(prompt: String, ctx: Dictionary = {}) -> String:
	var scripted := super.generate_line(prompt, ctx)
	if api_key.is_empty():
		return scripted
	var personality: String = str(ctx.get("personality", "neutral"))
	var body := JSON.stringify({
		"model": model,
		"messages": [
			{"role": "system", "content": SYSTEM_PROMPT},
			{"role": "user", "content": "Character personality: %s\nDirection: %s" % [personality, prompt]},
		],
		"max_tokens": 60,
		"temperature": 0.9,
	})
	var http := HTTPRequest.new()
	add_child(http)
	var headers := PackedStringArray([
		"Content-Type: application/json",
		"Authorization: Bearer %s" % api_key,
	])
	var endpoint := "%s/chat/completions" % base_url
	var err := http.request(endpoint, headers, HTTPClient.METHOD_POST, body)
	if err != OK:
		http.queue_free()
		return scripted
	var result: Array = await http.request_completed
	http.queue_free()
	if result[0] != HTTPRequest.RESULT_SUCCESS:
		return scripted
	var parsed = JSON.parse_string(result[3].get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		return scripted
	var choices: Variant = parsed.get("choices")
	if typeof(choices) != TYPE_ARRAY or (choices as Array).is_empty():
		return scripted
	var content: Variant = choices[0].get("message", {}).get("content", "")
	return str(content).strip_edges()
