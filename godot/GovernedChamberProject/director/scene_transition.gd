extends CanvasLayer

@onready var rect: ColorRect = $ColorRect


func fade_out(duration := 1.0) -> void:
	rect.modulate.a = 0.0
	rect.create_tween().tween_property(rect, "modulate:a", 1.0, duration)


func fade_in(duration := 1.0) -> void:
	rect.modulate.a = 1.0
	rect.create_tween().tween_property(rect, "modulate:a", 0.0, duration)
