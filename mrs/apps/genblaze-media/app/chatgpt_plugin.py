"""ChatGPT / Custom GPT plugin surface for Genblaze Engine3D.

Serves:
  GET /.well-known/ai-plugin.json
  GET /plugin/openapi.json

Drive-G-1:
  - OpenAPI matches the *real* ``POST /api/engine3d-still`` request/response
    (structure + optional polish/composite), not a fictional flat path map.
  - Soft-raster stills are capped at API max (1024); do not advertise 4K/8K
    as enforced Engine3D outputs.
  - Classic ChatGPT Plugins storefront was sunset; this surface is for
    **Custom GPT Actions** and local/ngrok discovery using the same manifest
    + OpenAPI pattern.
"""

from __future__ import annotations

from typing import Any

from app.config import Settings

PLUGIN_OPENAPI_PATH = "/plugin/openapi.json"
PLUGIN_MANIFEST_PATH = "/.well-known/ai-plugin.json"

# Paths gated when CHATGPT_PLUGIN_KEY is set.
PLUGIN_PROTECTED_PREFIXES = (
    "/api/engine3d-still",
    "/api/engine3d-sequence",
    "/api/polish-still",
)


def resolve_public_base(settings: Settings, request_base: str) -> str:
    """Prefer GENBLAZE_PUBLIC_BASE_URL (ngrok/prod); else request base."""
    configured = (getattr(settings, "public_base_url", None) or "").strip().rstrip("/")
    if configured:
        return configured
    return request_base.rstrip("/")


def build_ai_plugin_manifest(base_url: str, *, require_bearer: bool) -> dict[str, Any]:
    base = base_url.rstrip("/")
    auth: dict[str, Any]
    if require_bearer:
        auth = {"type": "service_http", "authorization_type": "bearer"}
    else:
        auth = {"type": "none"}

    return {
        "schema_version": "v1",
        "name_for_human": "Engine3D Renderer",
        "name_for_model": "engine3d_renderer",
        "description_for_human": (
            "Render governed Engine3D structure stills (soft-raster beauty + AOVs), "
            "optional fal polish realism, and optional RT4D background composite."
        ),
        "description_for_model": (
            "Use this tool when the user wants a rendered portrait or structured still. "
            "Always treat Engine3D as the geometry structure source (subject mesh/camera), "
            "fal polish as the realism layer (skin/hair when polish=true), and RT4D as "
            "background only via rt4d_background_run_id — never for faces or anatomy. "
            "Call POST /api/engine3d-still with width/height (16–1024; prefer ≤512 for "
            "speed), optional polish + prompt + polish_strength (0.3–0.7), and optional "
            "rt4d_background_run_id. Response includes structure (with preview_url) plus "
            "optional polish/composite objects — not raw local filesystem paths. "
            "Do not claim 4K/8K Engine3D soft-raster output; API max is 1024."
        ),
        "auth": auth,
        "api": {
            "type": "openapi",
            "url": f"{base}{PLUGIN_OPENAPI_PATH}",
            "has_user_authentication": False,
        },
        "logo_url": f"{base}/assets/engine3d-logo.svg",
        "contact_email": "support@localhost",
        "legal_info_url": f"{base}/legal",
    }


def build_plugin_openapi(base_url: str, *, require_bearer: bool) -> dict[str, Any]:
    """Scoped OpenAPI for Custom GPT Actions / plugin discovery."""
    base = base_url.rstrip("/")
    security = [{"bearerAuth": []}] if require_bearer else []
    components: dict[str, Any] = {
        "schemas": {
            "Engine3dStillRequest": {
                "type": "object",
                "required": ["width", "height"],
                "properties": {
                    "width": {
                        "type": "integer",
                        "minimum": 16,
                        "maximum": 1024,
                        "default": 256,
                        "description": "Output width. Soft-raster API max 1024; prefer ≤512.",
                    },
                    "height": {
                        "type": "integer",
                        "minimum": 16,
                        "maximum": 1024,
                        "default": 256,
                        "description": "Output height. Soft-raster API max 1024; prefer ≤512.",
                    },
                    "aov_depth": {"type": "boolean", "default": True},
                    "aov_normal": {"type": "boolean", "default": True},
                    "polish": {
                        "type": "boolean",
                        "default": False,
                        "description": (
                            "When true, run fal/NVIDIA img2img polish. Requires prompt "
                            "and GENBLAZE_POLISH_ENABLED + FAL_KEY."
                        ),
                    },
                    "prompt": {
                        "type": "string",
                        "maxLength": 2000,
                        "description": "Polish prompt (required when polish=true).",
                        "example": "cinematic portrait, detailed skin, soft key light",
                    },
                    "polish_strength": {
                        "type": "number",
                        "minimum": 0.0,
                        "maximum": 1.0,
                        "example": 0.45,
                    },
                    "rt4d_background_run_id": {
                        "type": "string",
                        "description": (
                            "Optional prior RT4D/generate run_id used as background plate. "
                            "RT4D is background-only — not subject anatomy."
                        ),
                    },
                },
            },
            "AssetPreview": {
                "type": "object",
                "properties": {
                    "run_id": {"type": "string"},
                    "preview_url": {
                        "type": "string",
                        "description": "Same-origin or presigned preview URL for the PNG.",
                    },
                    "kind": {"type": "string"},
                    "structure_source": {"type": "string"},
                    "asset_sha256": {"type": "string"},
                    "status": {"type": "string"},
                },
            },
            "Engine3dStillResponse": {
                "type": "object",
                "properties": {
                    "structure": {"$ref": "#/components/schemas/AssetPreview"},
                    "composite": {"$ref": "#/components/schemas/AssetPreview"},
                    "polish": {"$ref": "#/components/schemas/AssetPreview"},
                    "polish_error": {"type": "string"},
                    "note": {"type": "string"},
                },
            },
        }
    }
    if require_bearer:
        components["securitySchemes"] = {
            "bearerAuth": {"type": "http", "scheme": "bearer"}
        }

    return {
        "openapi": "3.0.1",
        "info": {
            "title": "Engine3D Rendering API (plugin scope)",
            "version": "1.0.0",
            "description": (
                "Scoped OpenAPI for Engine3D → optional polish → optional RT4D "
                "background composite. Full FastAPI schema remains at /openapi.json."
            ),
        },
        "servers": [{"url": base}],
        "paths": {
            "/api/engine3d-still": {
                "post": {
                    "operationId": "renderEngine3dStill",
                    "summary": "Render Engine3D structure still (+ optional polish/composite).",
                    "description": (
                        "Soft-rasters Engine3D triangles to beauty (+ AOVs), optionally "
                        "composites over an RT4D background run, optionally polishes via "
                        "diffusion. Returns nested structure/polish/composite objects with "
                        "preview_url — not filesystem paths."
                    ),
                    "security": security,
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "$ref": "#/components/schemas/Engine3dStillRequest"
                                }
                            }
                        },
                    },
                    "responses": {
                        "200": {
                            "description": "Structure still and optional polish/composite.",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "$ref": "#/components/schemas/Engine3dStillResponse"
                                    }
                                }
                            },
                        },
                        "400": {"description": "Invalid request (e.g. polish without prompt)."},
                        "401": {"description": "Missing/invalid bearer token (when configured)."},
                        "502": {"description": "Engine3D CLI or upstream polish failure."},
                        "503": {"description": "Engine3D or polish not available."},
                    },
                }
            }
        },
        "components": components,
    }


def plugin_availability(settings: Settings) -> dict[str, Any]:
    key = (getattr(settings, "chatgpt_plugin_key", None) or "").strip()
    return {
        "available": True,
        "manifest_path": PLUGIN_MANIFEST_PATH,
        "openapi_path": PLUGIN_OPENAPI_PATH,
        "auth": "bearer" if key else "none",
        "public_base_url": (getattr(settings, "public_base_url", None) or "").strip()
        or None,
        "note": (
            "Custom GPT Actions: import /plugin/openapi.json. "
            "Classic ChatGPT Plugins storefront is sunset; ai-plugin.json remains "
            "for ngrok discovery. Set CHATGPT_PLUGIN_KEY for bearer auth."
        ),
    }
