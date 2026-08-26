extends Node

signal state_changed(from_state: int, to_state: int)

enum State { IDLE, WALKING, TALKING, EXITING, EXITED }

var current: State = State.IDLE


func set_state(to_state: State) -> void:
	if to_state == current:
		return
	var prev := current
	current = to_state
	state_changed.emit(prev, to_state)
