from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.models import MemoryboardHints


def _settings(**overrides) -> Settings:
    base = dict(
        genblaze_base_url="https://genblaze.example.test",
        memoryboard_base_url="https://memoryboard.example.test",
        planner_mode="heuristic",
        planner_base_url=None,
        planner_model=None,
        planner_api_key=None,
        default_quality="draft",
        default_prompt_to_scene_width=256,
        default_prompt_to_scene_height=192,
        default_prompt_to_scene_samples=4,
        default_prompt_to_scene_max_depth=4,
        default_engine3d_width=256,
        default_engine3d_height=256,
    )
    base.update(overrides)
    return Settings(**base)


def _client(monkeypatch, settings: Settings, memoryboard: MemoryboardHints | None = None, dispatched: list[tuple[str, dict]] | None = None):
    dispatched = dispatched if dispatched is not None else []
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.main.read_memoryboard",
        lambda _settings, _context: memoryboard or MemoryboardHints(),
    )

    def _dispatch(_settings, target):
        dispatched.append((target.endpoint, target.payload))
        if target.endpoint == "/api/generate":
            return {"run_id": "rt4d-1", "preview_url": "/preview/rt4d-1", "provider": "rt4d-render"}
        if target.endpoint == "/api/prompt-to-scene":
            return {"run_id": "pts-1", "preview_url": "/preview/pts-1", "provider": "prompt-scene-bridge-rt4d"}
        if target.endpoint == "/api/render-scene":
            return {"run_id": "scene-1", "preview_url": "/preview/scene-1", "provider": "scene-spec-render"}
        return {
            "structure": {
                "run_id": "engine3d-1",
                "preview_url": "/preview/engine3d-1",
                "provider": "engine3d-still",
            }
        }

    monkeypatch.setattr("app.main.dispatch_render", _dispatch)
    return TestClient(app), dispatched


def test_health_ok(monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    monkeypatch.setattr(
        "app.main.probe_downstream",
        lambda _settings: type(
            "Status",
            (),
            {
                "model_dump": lambda self: {
                    "reachable": True,
                    "base_url": _settings.genblaze_base_url,
                    "image_backend": "rt4d",
                    "rt4d": {"available": True, "provider": "rt4d-render", "detail": None},
                    "prompt_to_scene": {"available": True, "provider": "prompt-scene-bridge", "detail": None},
                    "render_scene": {"available": True, "provider": "render-scene", "detail": None},
                    "engine3d_still": {"available": True, "provider": "engine3d-still", "detail": None},
                }
            },
        )(),
    )
    monkeypatch.setattr(
        "app.main.probe_planner",
        lambda _settings: type(
            "Planner",
            (),
            {
                "model_dump": lambda self: {
                    "mode": "heuristic",
                    "reachable": True,
                    "detail": "local heuristic planner",
                }
            },
        )(),
    )
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "mrs-infinity-director"
    assert body["memory_write_enabled"] is False
    assert body["print_sot"] == "cpu.rt4d.print"
    assert body["planner"]["reachable"] is True
    assert body["downstream"]["rt4d"]["available"] is True


def test_health_reports_planner_backend(monkeypatch):
    monkeypatch.setattr(
        "app.main.get_settings",
        lambda: _settings(
            planner_mode="ollama",
            planner_base_url="http://127.0.0.1:11434",
            planner_model="llama3.2:3b",
        ),
    )
    monkeypatch.setattr(
        "app.main.probe_downstream",
        lambda _settings: type("Status", (), {"model_dump": lambda self: {"reachable": False}})(),
    )
    monkeypatch.setattr(
        "app.main.probe_planner",
        lambda _settings: type(
            "Planner",
            (),
            {
                "model_dump": lambda self: {
                    "mode": "ollama",
                    "reachable": True,
                    "base_url": "http://127.0.0.1:11434",
                    "model": "llama3.2:3b",
                    "detail": None,
                }
            },
        )(),
    )
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["planner_mode"] == "ollama"
    assert body["planner_base_url"] == "http://127.0.0.1:11434"
    assert body["planner_model"] == "llama3.2:3b"


def test_root_serves_frontend(monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert "Infinity Memoryboard Director" in response.text


def test_director_header_middleware(monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    monkeypatch.setattr(
        "app.main.probe_downstream",
        lambda _settings: type("Status", (), {"model_dump": lambda self: {"reachable": False}})(),
    )
    monkeypatch.setattr(
        "app.main.probe_planner",
        lambda _settings: type("Planner", (), {"model_dump": lambda self: {"mode": "heuristic", "reachable": True}})(),
    )
    client = TestClient(app)
    response = client.get("/health")
    assert response.headers["X-MRS-Director"] == "infinity-memoryboard-director"


def test_prompt_only_routes_to_rt4d(monkeypatch):
    client, dispatched = _client(monkeypatch, _settings())
    response = client.post(
        "/api/direct",
        json={"prompt": "render a blue gold tesseract lattice with soft caustics"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["lane"] == "rt4d"
    assert body["dispatch"]["endpoint"] == "/api/generate"
    assert dispatched[0][0] == "/api/generate"
    assert body["context_used"]["memoryboard"] is False


def test_general_scene_routes_to_prompt_to_scene(monkeypatch):
    client, _ = _client(monkeypatch, _settings())
    response = client.post(
        "/api/direct",
        json={"prompt": "a sacred cathedral environment with blue glass and gold light"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["lane"] == "prompt_to_scene"
    assert body["dispatch"]["endpoint"] == "/api/prompt-to-scene"
    assert body["dispatch"]["payload"]["render"] is True


def test_structure_prompt_routes_to_engine3d_still(monkeypatch):
    client, dispatched = _client(monkeypatch, _settings())
    response = client.post(
        "/api/direct",
        json={
            "prompt": "portrait rig mesh structure hero shot",
            "source_run_id": "rt4d-plate-1",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["lane"] == "engine3d_still"
    assert body["dispatch"]["endpoint"] == "/api/engine3d-still"
    assert body["dispatch"]["payload"]["polish"] is False
    assert body["dispatch"]["payload"]["prompt"] == "portrait rig mesh structure hero shot"
    assert body["dispatch"]["payload"]["rt4d_background_run_id"] == "rt4d-plate-1"
    assert dispatched[0][1]["rt4d_background_run_id"] == "rt4d-plate-1"


def test_fast_speed_profile_routes_engine3d_with_tiny_dims(monkeypatch):
    client, dispatched = _client(monkeypatch, _settings())
    response = client.post(
        "/api/direct",
        json={
            "prompt": "soft lit geometric structure",
            "speed_profile": "fast",
            "mode": "auto",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["lane"] == "engine3d_still"
    assert body["dispatch"]["endpoint"] == "/api/engine3d-still"
    assert body["dispatch"]["payload"]["width"] == 256
    assert body["dispatch"]["payload"]["height"] == 256
    assert body["dispatch"]["payload"]["aov_depth"] is False
    assert body["speed_profile"]["id"] == "fast"
    assert body["speed_profile"]["print_sot"] is False
    assert dispatched[0][0] == "/api/engine3d-still"


def test_beauty_speed_profile_uses_512_engine3d(monkeypatch):
    client, _ = _client(monkeypatch, _settings())
    response = client.post(
        "/api/direct",
        json={
            "prompt": "cinematic portrait structure",
            "speed_profile": "beauty",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["lane"] == "engine3d_still"
    assert body["dispatch"]["payload"]["width"] == 512
    assert body["dispatch"]["payload"]["aov_depth"] is True
    assert body["plan"]["quality"] == "draft"
    assert "ao_enabled" in body["speed_profile"]["unsupported_flags"]


def test_speed_profiles_catalog(monkeypatch):
    monkeypatch.setattr("app.main.get_settings", lambda: _settings())
    client = TestClient(app)
    response = client.get("/api/speed-profiles")
    assert response.status_code == 200
    body = response.json()
    assert "fast" in body["profiles"]
    assert body["print_sot"] == "cpu.rt4d.print"


def test_forced_mode_overrides_heuristic_lane(monkeypatch):
    client, dispatched = _client(monkeypatch, _settings())
    response = client.post(
        "/api/direct",
        json={
            "prompt": "a sacred cathedral environment with blue glass",
            "mode": "rt4d",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["lane"] == "rt4d"
    assert body["dispatch"]["endpoint"] == "/api/generate"
    assert body["dispatch"]["payload"]["embed"] is False
    assert dispatched[0][0] == "/api/generate"


def test_explicit_scene_spec_routes_to_render_scene(monkeypatch):
    client, _ = _client(monkeypatch, _settings())
    response = client.post(
        "/api/direct",
        json={
            "scene_spec": {
                "schemaVersion": "1.0",
                "kind": "SceneSpecification",
                "id": "scene-123",
                "entities": [],
            },
            "quality": "high",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["lane"] == "render_scene"
    assert body["dispatch"]["endpoint"] == "/api/render-scene"
    assert body["dispatch"]["payload"]["quality"] == "final"


def test_memoryboard_context_is_read_only(monkeypatch):
    hints = MemoryboardHints(
        themes=["temple"],
        style_preferences=["glass"],
        lane_preferences=["prompt_to_scene"],
        archetype_vocabulary=["cathedral_caustic"],
        operator_hints=["majestic wide shot"],
    )
    client, dispatched = _client(monkeypatch, _settings(), memoryboard=hints)
    response = client.post(
        "/api/direct",
        json={
            "prompt": "continue the prior temple mood",
            "memory_context": {"memoryboard_id": "board-1", "session_id": "sess-1"},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["context_used"]["memoryboard"] is True
    assert body["lane"] == "prompt_to_scene"
    assert dispatched[0][0] == "/api/prompt-to-scene"


def test_jarvis_memoryboard_adapter_maps_real_shapes(monkeypatch):
    from app.memoryboard import read_memoryboard
    from app.models import MemoryContext

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.calls = []

        def get(self, url, params=None):
            self.calls.append((url, params))
            if url.endswith("/api/jarvis/memory/board"):
                return type(
                    "Resp",
                    (),
                    {
                        "raise_for_status": lambda self: None,
                        "json": lambda self: {
                            "memory_board": {
                                "board": {
                                    "board_id": "capability_adapter_board",
                                    "summary": "Jarvis continuity board",
                                    "linked_subsystems": ["aais_capability_module", "jarvis"],
                                },
                                "slots": [
                                    {
                                        "slot_id": "slot_01",
                                        "slot_name": "Foundation",
                                        "accepted_class": "foundation",
                                        "module": {
                                            "display_name": "Cathedral Continuity",
                                            "summary": "Canonical scene identity and doctrine.",
                                            "linked_subsystem": "jarvis",
                                        },
                                    },
                                    {
                                        "slot_id": "slot_06",
                                        "slot_name": "Preferences",
                                        "accepted_class": "preference",
                                        "module": {
                                            "display_name": "Style Preferences",
                                            "summary": "User aesthetic preferences.",
                                            "linked_subsystem": "jarvis",
                                        },
                                    },
                                ],
                                "governance": [{"action": "protected_install", "detail": "Board remains governed."}],
                            }
                        },
                    },
                )()
            return type(
                "Resp",
                (),
                {
                    "raise_for_status": lambda self: None,
                    "json": lambda self: {
                        "memories": [
                            {
                                "content": "Prefer sacred glass cathedrals with gold and blue light.",
                                "category": "preference",
                                "tags": ["preference", "glass", "cathedral"],
                                "scope": "persistent",
                                "state_class": "live",
                                "truth_status": "stable_user",
                            },
                            {
                                "content": "Tesseract lattice continuity remains canonical.",
                                "category": "foundation",
                                "tags": ["tesseract", "lattice"],
                                "scope": "persistent",
                                "state_class": "live",
                                "truth_status": "canonical",
                            },
                        ]
                    },
                },
            )()

        def close(self):
            return None

    hints = read_memoryboard(
        _settings(memoryboard_base_url="http://jarvis.local"),
        MemoryContext(memoryboard_id="board-1", session_id="sess-1"),
        client=FakeClient(),
    )
    assert "Jarvis continuity board" in hints.themes
    assert any("sacred glass cathedrals" in item for item in hints.style_preferences)
    assert "rt4d" in hints.lane_preferences
    assert "cathedral" in hints.archetype_vocabulary or "Cathedral Continuity" in hints.archetype_vocabulary
    assert any("Board remains governed." in item for item in hints.operator_hints)


def test_explicit_source_run_id_is_echoed_but_no_asset_scan(monkeypatch):
    client, _ = _client(monkeypatch, _settings())
    response = client.post(
        "/api/direct",
        json={
            "prompt": "render a deterministic mandala lattice",
            "source_run_id": "run-abc-123",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["context_used"]["source_run_id"] == "run-abc-123"


def test_invalid_quality_rejected(monkeypatch):
    client, _ = _client(monkeypatch, _settings())
    response = client.post(
        "/api/direct",
        json={"prompt": "blue lattice", "quality": "ultra"},
    )
    assert response.status_code == 422


def test_openai_compatible_planner_mode(monkeypatch):
    from app import planner as planner_mod

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def post(self, url, headers=None, json=None):
            assert url == "http://127.0.0.1:13305/api/v1/chat/completions"
            assert json["model"] == "TinyLlama-Chat"
            content = (
                '{"lane":"rt4d","archetype":"tesseract_lattice","style":{"material":"glass","palette":["gold","blue"],'
                '"lighting":"soft_caustics"},"camera":{"shot":"wide","mood":"majestic"},"quality":"draft"}'
            )
            return type(
                "Resp",
                (),
                {
                    "raise_for_status": lambda self: None,
                    "json": lambda self: {"choices": [{"message": {"content": content}}]},
                },
            )()

        def close(self):
            return None

    monkeypatch.setattr(planner_mod.httpx, "Client", FakeClient)
    plan = planner_mod.openai_plan(
        request=type("Req", (), {"prompt": "gold blue lattice", "quality": "draft", "source_run_id": None, "scene_spec": None})(),
        hints=MemoryboardHints(),
        settings=_settings(
            planner_mode="openai",
            planner_base_url="http://127.0.0.1:13305/api/v1",
            planner_model="TinyLlama-Chat",
        ),
    )
    assert plan.lane == "rt4d"
    assert plan.archetype == "tesseract_lattice"


def test_ollama_planner_mode(monkeypatch):
    from app import planner as planner_mod

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def post(self, url, json=None):
            assert url == "http://127.0.0.1:11434/api/chat"
            assert json["model"] == "llama3.2:3b"
            content = (
                '{"lane":"prompt_to_scene","archetype":"cathedral_caustic","style":{"material":"glass","palette":["gold"],'
                '"lighting":"soft_caustics"},"camera":{"shot":"wide","mood":"sacred"},"quality":"draft"}'
            )
            return type(
                "Resp",
                (),
                {
                    "raise_for_status": lambda self: None,
                    "json": lambda self: {"message": {"content": content}},
                },
            )()

        def close(self):
            return None

    monkeypatch.setattr(planner_mod.httpx, "Client", FakeClient)
    plan = planner_mod.ollama_plan(
        request=type("Req", (), {"prompt": "sacred cathedral", "quality": "draft", "source_run_id": None, "scene_spec": None})(),
        hints=MemoryboardHints(),
        settings=_settings(
            planner_mode="ollama",
            planner_base_url="http://127.0.0.1:11434",
            planner_model="llama3.2:3b",
        ),
    )
    assert plan.lane == "prompt_to_scene"
    assert plan.camera.mood == "sacred"
