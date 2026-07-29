from __future__ import annotations

from typing import Any

import httpx

from app.config import Settings
from app.models import MemoryContext, MemoryboardHints


class MemoryboardReadError(RuntimeError):
    """Read-only memoryboard adapter failure."""


def _coerce_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def extract_hints(payload: dict[str, Any] | None) -> MemoryboardHints:
    source = payload or {}
    return MemoryboardHints(
        themes=_coerce_list(source.get("themes")),
        style_preferences=_coerce_list(source.get("style_preferences")),
        lane_preferences=_coerce_list(source.get("lane_preferences")),
        archetype_vocabulary=_coerce_list(source.get("archetype_vocabulary")),
        operator_hints=_coerce_list(source.get("operator_hints")),
    )


def _extract_from_jarvis_board(board: dict[str, Any]) -> MemoryboardHints:
    board_meta = board.get("board") if isinstance(board.get("board"), dict) else {}
    slots = board.get("slots") if isinstance(board.get("slots"), list) else []
    governance = board.get("governance") if isinstance(board.get("governance"), list) else []

    themes: list[str] = []
    style_preferences: list[str] = []
    lane_preferences: list[str] = []
    archetype_vocabulary: list[str] = []
    operator_hints: list[str] = []

    board_summary = str(board_meta.get("summary") or "").strip()
    if board_summary:
        themes.append(board_summary)
    for subsystem in _coerce_list(board_meta.get("linked_subsystems")):
        operator_hints.append(subsystem)
    for slot in slots:
        if not isinstance(slot, dict):
            continue
        slot_name = str(slot.get("slot_name") or "").strip()
        accepted_class = str(slot.get("accepted_class") or "").strip()
        if slot_name:
            operator_hints.append(slot_name)
        if accepted_class == "preference":
            style_preferences.append("preference")
        if accepted_class == "operational":
            lane_preferences.append("prompt_to_scene")
        if accepted_class in {"foundation", "identity"}:
            lane_preferences.append("rt4d")
        module = slot.get("module")
        if isinstance(module, dict):
            summary = str(module.get("summary") or "").strip()
            display_name = str(module.get("display_name") or "").strip()
            linked_subsystem = str(module.get("linked_subsystem") or "").strip()
            if summary:
                operator_hints.append(summary)
            if display_name:
                archetype_vocabulary.append(display_name)
            if linked_subsystem:
                operator_hints.append(linked_subsystem)
    for item in governance:
        if isinstance(item, dict):
            detail = str(item.get("detail") or item.get("action") or "").strip()
            if detail:
                operator_hints.append(detail)
    return MemoryboardHints(
        themes=themes[:6],
        style_preferences=style_preferences[:6],
        lane_preferences=lane_preferences[:6],
        archetype_vocabulary=archetype_vocabulary[:8],
        operator_hints=operator_hints[:12],
    )


def _extract_from_jarvis_memories(memories: list[Any]) -> MemoryboardHints:
    themes: list[str] = []
    style_preferences: list[str] = []
    lane_preferences: list[str] = []
    archetype_vocabulary: list[str] = []
    operator_hints: list[str] = []

    for raw in memories:
        if not isinstance(raw, dict):
            continue
        content = str(raw.get("content") or raw.get("text") or "").strip()
        category = str(raw.get("category") or "").strip().lower()
        state_class = str(raw.get("state_class") or "").strip().lower()
        truth_status = str(raw.get("truth_status") or "").strip().lower()
        scope = str(raw.get("scope") or "").strip().lower()
        tags = [str(tag).strip().lower() for tag in list(raw.get("tags") or []) if str(tag).strip()]
        if category in {"foundation", "identity"} or truth_status == "canonical":
            if content:
                themes.append(content)
                archetype_vocabulary.extend(tags)
            lane_preferences.append("rt4d")
        elif category == "preference" or "preference" in tags:
            if content:
                style_preferences.append(content)
        elif category == "signal" or truth_status in {"signal", "pending"}:
            if content:
                operator_hints.append(content)
        elif scope == "session" or state_class == "session":
            if content:
                operator_hints.append(content)
                lane_preferences.append("engine3d_still")
        else:
            if content:
                operator_hints.append(content)
                themes.append(content)
        for tag in tags:
            if tag in {"tesseract", "lattice", "mandala", "cathedral", "temple", "portrait", "glass", "chrome"}:
                archetype_vocabulary.append(tag)
    return MemoryboardHints(
        themes=themes[:8],
        style_preferences=style_preferences[:8],
        lane_preferences=lane_preferences[:8],
        archetype_vocabulary=archetype_vocabulary[:12],
        operator_hints=operator_hints[:12],
    )


def _merge_hints(*parts: MemoryboardHints) -> MemoryboardHints:
    def merge(attr: str, limit: int) -> list[str]:
        out: list[str] = []
        for part in parts:
            for item in list(getattr(part, attr) or []):
                cleaned = str(item).strip()
                if cleaned and cleaned not in out:
                    out.append(cleaned)
        return out[:limit]

    return MemoryboardHints(
        themes=merge("themes", 8),
        style_preferences=merge("style_preferences", 8),
        lane_preferences=merge("lane_preferences", 8),
        archetype_vocabulary=merge("archetype_vocabulary", 12),
        operator_hints=merge("operator_hints", 16),
    )


def read_memoryboard(
    settings: Settings,
    context: MemoryContext | None,
    client: httpx.Client | None = None,
) -> MemoryboardHints:
    if context is None or not context.memoryboard_id or not settings.memoryboard_base_url:
        return MemoryboardHints()
    own_client = client is None
    request_client = client or httpx.Client(timeout=settings.memoryboard_timeout_seconds)
    try:
        board_response = request_client.get(
            f"{settings.memoryboard_base_url.rstrip('/')}/api/jarvis/memory/board",
            params={"truth_scope": "live"},
        )
        board_response.raise_for_status()
        memories_response = request_client.get(
            f"{settings.memoryboard_base_url.rstrip('/')}/api/jarvis/memory",
            params={
                "truth_scope": "live",
                "limit": 12,
                **({"query": context.memoryboard_id} if context.memoryboard_id else {}),
            },
        )
        memories_response.raise_for_status()
        board_body = board_response.json()
        memories_body = memories_response.json()
    except Exception as exc:  # noqa: BLE001
        raise MemoryboardReadError(f"memoryboard read failed: {exc}") from exc
    finally:
        if own_client:
            request_client.close()
    if not isinstance(board_body, dict) or not isinstance(memories_body, dict):
        raise MemoryboardReadError("memoryboard read failed: expected object response")
    board = board_body.get("memory_board")
    memories = memories_body.get("memories")
    if not isinstance(board, dict):
        raise MemoryboardReadError("memoryboard read failed: missing memory_board")
    if not isinstance(memories, list):
        raise MemoryboardReadError("memoryboard read failed: missing memories list")
    return _merge_hints(
        _extract_from_jarvis_board(board),
        _extract_from_jarvis_memories(memories),
    )
