extends Node

signal emotion_changed(emotion: String, intensity: float)

var current_emotion := "neutral"
var intensity := 0.0


func set_emotion(name: String, new_intensity: float = 0.5) -> void:
	current_emotion = name.to_lower()
	intensity = clampf(new_intensity, 0.0, 1.0)
	emotion_changed.emit(current_emotion, intensity)
	apply_emotion()


func apply_emotion() -> void:
	var actor := get_parent()
	var blend := "neutral"
	match current_emotion:
		"happy":
			blend = "smile"
		"angry":
			blend = "frown"
		"sad":
			blend = "sad"
		"afraid":
			blend = "fear"
	actor.play_facial(blend, intensity)
	if EMOTION_TINTS.has(current_emotion):
		actor.apply_tint(EMOTION_TINTS[current_emotion], intensity)

const EMOTION_TINTS := {
	"neutral": Color(1, 1, 1),
	"happy": Color(1.0, 0.85, 0.55),
	"sad": Color(0.55, 0.62, 0.85),
	"angry": Color(1.0, 0.4, 0.35),
	"afraid": Color(0.7, 0.9, 0.8),
}
