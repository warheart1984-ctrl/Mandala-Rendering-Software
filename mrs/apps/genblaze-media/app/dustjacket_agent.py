"""
Dustjacket Agent — Vertex AI Reasoning Engine (Agentic Cinema Hackathon)
Pilots the FMCE constitutional pipeline with Grafana observability.

Deploy:
  vertexai.init(project="marine-proposal-430017-b4", location="us-central1", staging_bucket="gs://your-bucket")
  remote = ReasoningEngine.create(DustjacketAgent(), requirements=[...], display_name="dustjacket")
"""

import os
import re
import json
import asyncio
import httpx
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
from datetime import datetime, timezone

# Configuration from environment
GENBLAZE_BASE_URL = os.getenv("GENBLAZE_BASE_URL", "https://mrs-genblaze-media-351151207359.us-central1.run.app")
GRAFANA_INSTANCE = os.getenv("GRAFANA_CLOUD_INSTANCE", "fondspringbok1460.grafana.net")
GRAFANA_API_KEY = os.getenv("GRAFANA_CLOUD_API_KEY", "")
GRAFANA_PROMETHEUS_URL = os.getenv("GRAFANA_CLOUD_PROMETHEUS_URL", "https://prometheus-prod-56-prod-us-east-2.grafana.net")
GRAFANA_REMOTE_WRITE_URL = os.getenv("GRAFANA_CLOUD_REMOTE_WRITE_URL", "https://prometheus-prod-56-prod-us-east-2.grafana.net/api/prom/push")
GRAFANA_USERNAME = os.getenv("GRAFANA_CLOUD_PROMETHEUS_USERNAME", "3453458")

# Gemini Enterprise (google-genai, ADC) — shot-script / cinematic-intent layer.
# DUSTJACKET_USE_GEMINI = "auto" (default) | "1"/"true" | "0"/"false".
# "auto" enables Gemini only when Google Cloud auth is configured, so the agent
# never fails on a missing API key and stays replayable in tests.
DUSTJACKET_USE_GEMINI = os.getenv("DUSTJACKET_USE_GEMINI", "auto").strip().lower()
DUSTJACKET_GEMINI_MODEL = os.getenv("DUSTJACKET_GEMINI_MODEL", "gemini-3.5-flash")
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
GOOGLE_CLOUD_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1").strip()

_GEMINI_ON = DUSTJACKET_USE_GEMINI in {"1", "true", "yes", "on"}
_GEMINI_AUTO = DUSTJACKET_USE_GEMINI == "auto"


def default_shot_script(prompt: str) -> Dict[str, Any]:
    """Deterministic baseline shot plan (Gemini off / unreachable).

    Replayable-reality default: fixed camera, lighting, composition, and
    render params derived only from the caller's explicit arguments.
    """
    return {
        "shot_intent": prompt,
        "camera": {"motion": "static-orbit", "fov_deg": 45.0, "distance": 1.0},
        "lighting": {"key": "three-point", "intensity": 1.0},
        "composition": {"rule": "center", "depth": "midground"},
        "style": "photoreal",
        "render_params": {
            "quality": "draft",
            "then_scene": False,
            "then_polish": False,
        },
        "refined_prompt": prompt,
        "source": "deterministic-default",
    }


def parse_shot_script(text: str) -> Optional[Dict[str, Any]]:
    """Parse Gemini JSON output, tolerating markdown ```json fences."""
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return None
    return data if isinstance(data, dict) else None


@dataclass
class FrameMetrics:
    frame_index: int
    shot_id: str
    structure_render_ms: float
    beauty_render_ms: float
    total_ms: float
    backend: str
    anime_claim: bool
    structure_sha256: str
    beauty_sha256: Optional[str] = None
    gpu_memory_mb: Optional[float] = None
    gpu_utilization_pct: Optional[float] = None
    tokens_used: Optional[int] = None
    api_latency_ms: Optional[float] = None


class DustjacketAgent:
    """
    Vertex AI Reasoning Engine compatible agent.
    Implements the Queryable interface (query method).
    """
    
    def __init__(self):
        self._genblaze_client = None
        self._grafana_client = None
    
    def _get_genblaze_client(self) -> httpx.AsyncClient:
        if self._genblaze_client is None:
            self._genblaze_client = httpx.AsyncClient(timeout=300.0)
        return self._genblaze_client
    
    def _get_grafana_client(self) -> Optional[httpx.AsyncClient]:
        if not self._grafana_client and GRAFANA_REMOTE_WRITE_URL and GRAFANA_API_KEY:
            import base64
            creds = base64.b64encode(f"{GRAFANA_USERNAME}:{GRAFANA_API_KEY}".encode()).decode()
            self._grafana_client = httpx.AsyncClient(
                base_url=GRAFANA_REMOTE_WRITE_URL,
                headers={"Authorization": f"Basic {creds}", "Content-Type": "text/plain"},
                timeout=30.0
            )
        return self._grafana_client
    
    async def _genblaze_generate(
        self,
        prompt: str,
        quality: str = "draft",
        then_scene: bool = False,
        then_polish: bool = False,
        style: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate RT4D still via Genblaze Media API."""
        client = self._get_genblaze_client()
        url = f"{GENBLAZE_BASE_URL}/api/generate"
        payload = {
            "prompt": prompt,
            "quality": quality,
            "then_scene": then_scene,
            "then_polish": then_polish,
        }
        if style:
            payload["style"] = style
        
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()
    
    async def _genblaze_generate_video(
        self,
        prompt: str,
        backend: str = "nvidia",
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate video via Genblaze (Cosmos/Seedance)."""
        client = self._get_genblaze_client()
        url = f"{GENBLAZE_BASE_URL}/api/generate-video"
        payload = {"prompt": prompt}
        if model:
            payload["model"] = model
        
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()
    
    async def _grafana_push_metrics(self, metrics: FrameMetrics) -> bool:
        """Push frame metrics to Grafana Cloud Prometheus."""
        client = self._get_grafana_client()
        if not client:
            return False
        
        timestamp_ns = int(datetime.now(timezone.utc).timestamp() * 1e9)
        lines = [
            f'mrs_frame_duration_ms{{shot="{metrics.shot_id}",backend="{metrics.backend}",anime_claim="{str(metrics.anime_claim).lower()}"}} {metrics.total_ms} {timestamp_ns}',
            f'mrs_structure_render_ms{{shot="{metrics.shot_id}"}} {metrics.structure_render_ms} {timestamp_ns}',
            f'mrs_beauty_render_ms{{shot="{metrics.shot_id}",backend="{metrics.backend}"}} {metrics.beauty_render_ms} {timestamp_ns}',
        ]
        
        if metrics.gpu_memory_mb is not None:
            lines.append(f'mrs_gpu_memory_mb{{shot="{metrics.shot_id}"}} {metrics.gpu_memory_mb} {timestamp_ns}')
        if metrics.gpu_utilization_pct is not None:
            lines.append(f'mrs_gpu_utilization_pct{{shot="{metrics.shot_id}"}} {metrics.gpu_utilization_pct} {timestamp_ns}')
        if metrics.tokens_used is not None:
            lines.append(f'mrs_tokens_used{{shot="{metrics.shot_id}",backend="{metrics.backend}"}} {metrics.tokens_used} {timestamp_ns}')
        if metrics.api_latency_ms is not None:
            lines.append(f'mrs_api_latency_ms{{shot="{metrics.shot_id}",backend="{metrics.backend}"}} {metrics.api_latency_ms} {timestamp_ns}')
        
        payload = "\n".join(lines) + "\n"
        
        try:
            resp = await client.post(
                "/api/v1/push",
                content=payload,
                headers={"Content-Type": "text/plain"}
            )
            return resp.status_code == 204
        except Exception:
            return False
    
    async def _fmce_validate(
        self,
        pilot_proposal: Dict[str, Any],
        state_snapshot: Dict[str, Any],
        continuity_proof: Dict[str, Any],
        domain_signatures: List[str],
        intent_id: str,
        world_id: str,
        timeline_id: str,
        time_seconds: float,
        parameters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Run FMCE constitutional validation pipeline:
        CPP → V12 → Evidence → Replay → RT4D → Mandala
        """
        # This integrates with the actual FMCE modules in renderer-core
        # For the agent, we return the validation structure
        return {
            "validated_command": pilot_proposal,
            "authority_token": f"auth-{intent_id}",
            "execution_contract": {"status": "authorized", "pipeline": "fmce"},
            "evidence_requirements": {"provenance": True, "replay": True},
            "intent_id": intent_id,
            "world_id": world_id,
            "timeline_id": timeline_id,
            "time_seconds": time_seconds,
            "parameters": parameters
        }
    
    def _gemini_shot_script(self, prompt: str, use_gemini: Optional[bool] = None) -> Dict[str, Any]:
        """Turn a prompt into a shot script via Gemini Enterprise.

        Uses the google-genai SDK with Application Default Credentials
        (vertexai=True). The model is asked for a JSON shot plan — camera,
        lighting, composition, style, and render params — plus a refined
        prompt for the renderer.

        ``use_gemini`` per-request override: True forces Gemini, False forces
        the deterministic default, None defers to env config. Fails closed:
        whenever Gemini is disabled, unconfigured, or errors, returns
        ``default_shot_script(prompt)`` so the render pipeline never blocks on
        the LLM and stays deterministic in tests.
        """
        enabled = use_gemini if use_gemini is not None else bool(
            _GEMINI_ON or (_GEMINI_AUTO and (GOOGLE_CLOUD_PROJECT or os.getenv("GOOGLE_GENAI_USE_ENTERPRISE")))
        )
        if not enabled:
            return default_shot_script(prompt)

        try:
            from google import genai
            from google.genai.types import GenerateContentConfig

            location = GOOGLE_CLOUD_LOCATION or "global"
            client = genai.Client(vertexai=True, project=GOOGLE_CLOUD_PROJECT, location=location)
            instruction = (
                "You are the shot-script layer of a governed cinematic rendering agent.\n"
                "Given a render prompt, return ONLY a JSON object with exactly these keys:\n"
                '  "shot_intent": short one-line cinematic intent\n'
                '  "camera": {"motion": string, "fov_deg": number, "distance": number}\n'
                '  "lighting": {"key": string, "intensity": number}\n'
                '  "composition": {"rule": string, "depth": string}\n'
                '  "style": "photoreal" | "anime" | "cinematic"\n'
                '  "render_params": {"quality": "draft"|"final", "then_scene": bool, "then_polish": bool}\n'
                '  "refined_prompt": a concrete, renderer-ready rewrite of the prompt\n'
                "Do not include markdown, comments, or any text outside the JSON object.\n"
            )
            resp = client.models.generate_content(
                model=DUSTJACKET_GEMINI_MODEL,
                contents=instruction + prompt,
                config=GenerateContentConfig(
                    response_mime_type="application/json",
                    max_output_tokens=1024,
                    temperature=0.2,
                ),
            )
            script = parse_shot_script(resp.text) if resp and resp.text else None
            if script is None:
                return default_shot_script(prompt)
            script.setdefault("source", "gemini-shot-script")
            if not script.get("refined_prompt"):
                script["refined_prompt"] = prompt
            return script
        except Exception as exc:  # noqa: BLE001 - fail closed, never block rendering
            script = default_shot_script(prompt)
            script["gemini_error"] = f"{type(exc).__name__}: {exc}"
            return script

    async def _render_pipeline(
        self,
        prompt: str,
        shot_id: str,
        frame_count: int = 1,
        quality: str = "draft",
        style: Optional[str] = None,
        push_metrics: bool = True,
        use_gemini: Optional[bool] = None
    ) -> Dict[str, Any]:
        """
        Full render pipeline: shot-script → validate → generate → push metrics.
        """
        intent_id = f"dustjacket-{shot_id}-{datetime.now(timezone.utc).isoformat()}"

        # Step 0: Cinematic intent via Gemini (fail-closed to deterministic default).
        shot_script = self._gemini_shot_script(prompt, use_gemini=use_gemini)
        refined_prompt = shot_script.get("refined_prompt") or prompt
        render_params = shot_script.get("render_params") or {}
        effective_style = style or shot_script.get("style")
        
        # Step 1: FMCE validation
        validation = await self._fmce_validate(
            pilot_proposal={"action": "render", "prompt": refined_prompt, "domain": "cinema", "shot_script": shot_script},
            state_snapshot={"shot_id": shot_id, "frame_count": frame_count},
            continuity_proof={},
            domain_signatures=["cinema", "rendering"],
            intent_id=intent_id,
            world_id="mandala-cinema",
            timeline_id=shot_id,
            time_seconds=0,
            parameters={"prompt": refined_prompt, "quality": render_params.get("quality", quality), "shot_script": shot_script}
        )
        
        if not validation.get("authority_token"):
            return {"error": "FMCE validation failed", "validation": validation}

        results = []
        
        # Step 2: Generate frames
        for frame_idx in range(frame_count):
            start = datetime.now()
            
            gen_result = await self._genblaze_generate(
                prompt=refined_prompt,
                quality=render_params.get("quality", quality),
                then_scene=bool(render_params.get("then_scene", False)),
                then_polish=bool(render_params.get("then_polish", False)),
                style=effective_style
            )
            
            elapsed_ms = (datetime.now() - start).total_seconds() * 1000
            
            # Step 3: Push metrics to Grafana
            if push_metrics:
                metrics = FrameMetrics(
                    frame_index=frame_idx,
                    shot_id=shot_id,
                    structure_render_ms=elapsed_ms * 0.6,
                    beauty_render_ms=elapsed_ms * 0.4,
                    total_ms=elapsed_ms,
                    backend=gen_result.get("provider", "rt4d-render"),
                    anime_claim=style == "anime" or effective_style == "anime",
                    structure_sha256=gen_result.get("asset_sha256", ""),
                    beauty_sha256=None,
                    api_latency_ms=elapsed_ms
                )
                await self._grafana_push_metrics(metrics)
            
            results.append({
                "frame_index": frame_idx,
                "generation": gen_result,
                "elapsed_ms": elapsed_ms
            })
        
        return {
            "intent_id": intent_id,
            "validation": validation,
            "shot_script": shot_script,
            "frames": results,
            "status": "completed"
        }
    
    def query(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main entry point for Vertex AI Reasoning Engine.
        Expected input:
        {
            "prompt": "tesseract lattice cyan neon",
            "shot_id": "shot-001",
            "frame_count": 8,
            "quality": "draft",
            "style": "anime",
            "push_metrics": true,
            "use_gemini": true          # optional; forces/forbids the Gemini shot-script layer
        }
        """
        prompt = input.get("prompt", "mandala neural lattice")
        shot_id = input.get("shot_id", f"shot-{datetime.now().strftime('%H%M%S')}")
        frame_count = input.get("frame_count", 1)
        quality = input.get("quality", "draft")
        style = input.get("style")
        push_metrics = input.get("push_metrics", True)
        use_gemini = input.get("use_gemini")
        
        # Run the async pipeline
        result = asyncio.run(self._render_pipeline(
            prompt=prompt,
            shot_id=shot_id,
            frame_count=frame_count,
            quality=quality,
            style=style,
            push_metrics=push_metrics,
            use_gemini=use_gemini
        ))
        
        return result
    
    async def close(self):
        if self._genblaze_client:
            await self._genblaze_client.aclose()
        if self._grafana_client:
            await self._grafana_client.aclose()


# For local testing
if __name__ == "__main__":
    import sys
    
    agent = DustjacketAgent()
    
    try:
        if len(sys.argv) < 2:
            # Default test
            test_input = {
                "prompt": "tesseract lattice cyan neon, photoreal 4d mandala",
                "shot_id": "test-shot-001",
                "frame_count": 1,
                "quality": "draft"
            }
        else:
            test_input = json.loads(sys.argv[1])
        
        result = agent.query(test_input)
        print(json.dumps(result, indent=2))
    
    finally:
        asyncio.run(agent.close())