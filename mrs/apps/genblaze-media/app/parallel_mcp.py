"""Parallel Search MCP Integration — Director Agent Tools.

Provides runtime web intelligence for agentic cinema:
- Style reference search (anime cel-shaded, Makoto Shinkai, Studio Ghibli, etc.)
- Cinematography reference search (camera moves, lighting setups, lens choices)
- Color palette search (mood-based, era-specific, director-specific)
- Real-time grounding for Gemini img2img prompts.

Requires: PARALLEL_API_KEY (get from parallel.ai)
"""

from __future__ import annotations

import os
import json
import asyncio
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import quote_plus

import httpx
from pydantic import BaseModel, Field


PARALLEL_API_BASE = "https://api.parallel.ai/v1"
PARALLEL_SEARCH_ENDPOINT = f"{PARALLEL_API_BASE}/search"
PARALLEL_DEEP_RESEARCH_ENDPOINT = f"{PARALLEL_API_BASE}/deep-research"


class ParallelSearchError(Exception):
    """Parallel Search API error."""
    pass


class ParallelConfigError(ParallelSearchError):
    """Missing or invalid configuration."""
    pass


@dataclass
class StyleRef:
    """Anime/style reference result."""
    title: str
    url: str
    snippet: str
    source: str
    relevance_score: float
    visual_elements: list[str] = None
    color_notes: str = ""
    cinematography_notes: str = ""

    def to_prompt_fragment(self) -> str:
        parts = [f"Style ref: {self.title}"]
        if self.visual_elements:
            parts.append(f"Visual: {', '.join(self.visual_elements)}")
        if self.color_notes:
            parts.append(f"Colors: {self.color_notes}")
        if self.cinematography_notes:
            parts.append(f"Camera: {self.cinematography_notes}")
        return " | ".join(parts)


@dataclass
class CinematographyRef:
    """Cinematography reference result."""
    title: str
    url: str
    snippet: str
    source: str
    relevance_score: float
    camera_move: str = ""
    lens: str = ""
    lighting: str = ""
    composition: str = ""

    def to_prompt_fragment(self) -> str:
        parts = [f"Cinematography: {self.title}"]
        if self.camera_move:
            parts.append(f"Move: {self.camera_move}")
        if self.lens:
            parts.append(f"Lens: {self.lens}")
        if self.lighting:
            parts.append(f"Lighting: {self.lighting}")
        if self.composition:
            parts.append(f"Composition: {self.composition}")
        return " | ".join(parts)


@dataclass
class ColorPalette:
    """Color palette reference result."""
    name: str
    url: str
    snippet: str
    source: str
    relevance_score: float
    hex_colors: list[str] = None
    mood: str = ""
    era: str = ""
    director: str = ""

    def to_prompt_fragment(self) -> str:
        parts = [f"Palette: {self.name}"]
        if self.hex_colors:
            parts.append(f"Hex: {', '.join(self.hex_colors[:6])}")
        if self.mood:
            parts.append(f"Mood: {self.mood}")
        if self.era:
            parts.append(f"Era: {self.era}")
        if self.director:
            parts.append(f"Director: {self.director}")
        return " | ".join(parts)


class ParallelMCPClient:
    """MCP-compatible client for Parallel Search."""

    def __init__(self, api_key: str | None = None, timeout: float = 30.0):
        self.api_key = api_key or os.getenv("PARALLEL_API_KEY", "").strip()
        if not self.api_key:
            raise ParallelConfigError("PARALLEL_API_KEY not set")
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self):
        self._client = httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "MRS-Constitutional-Anime/1.0",
            },
            timeout=self.timeout,
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._client:
            await self._client.aclose()

    async def _search(self, query: str, num_results: int = 5, **filters) -> list[dict]:
        """Execute a Parallel search query."""
        if not self._client:
            raise ParallelSearchError("Client not initialized. Use async context manager.")

        payload = {
            "search_queries": [query],
        }

        resp = await self._client.post(PARALLEL_SEARCH_ENDPOINT, json=payload)
        if resp.status_code == 401:
            raise ParallelConfigError("Invalid PARALLEL_API_KEY")
        if resp.status_code == 429:
            raise ParallelSearchError("Rate limited")
        if resp.status_code != 200:
            raise ParallelSearchError(f"HTTP {resp.status_code}: {resp.text[:200]}")

        data = resp.json()
        # Parallel returns results per query, flatten
        all_results = []
        for query_result in data.get("results", []):
            all_results.extend(query_result.get("results", []))
        return all_results[:num_results]

    async def search_style_refs(
        self,
        shot_description: str,
        anime_style: str = "cel-shaded anime",
        num_results: int = 5,
    ) -> list[StyleRef]:
        """Search for anime/style references matching a shot description."""
        query = (
            f"{anime_style} style reference for: {shot_description}. "
            f"Visual elements, color palette, line art, shading technique, "
            f"background art, character design. "
            f"References: Makoto Shinkai, Studio Ghibli, Kyoto Animation, "
            f"Wit Studio, MAPPA, Ufotable, CoMix Wave Films."
        )

        results = await self._search(query, num_results=num_results)
        style_refs = []

        for r in results:
            visual_elements = self._extract_visual_elements(r.get("snippet", ""))
            color_notes = self._extract_color_notes(r.get("snippet", ""))
            cinematography_notes = self._extract_cinematography_notes(r.get("snippet", ""))

            style_refs.append(StyleRef(
                title=r.get("title", "Unknown"),
                url=r.get("url", ""),
                snippet=r.get("snippet", ""),
                source=r.get("source", "web"),
                relevance_score=r.get("score", 0.0),
                visual_elements=visual_elements,
                color_notes=color_notes,
                cinematography_notes=cinematography_notes,
            ))

        return style_refs

    async def search_cinematography_refs(
        self,
        shot_type: str,
        mood: str = "cinematic",
        num_results: int = 5,
    ) -> list[CinematographyRef]:
        """Search for cinematography references (camera moves, lighting, lenses)."""
        query = (
            f"{mood} cinematography reference for {shot_type} shot. "
            f"Camera movement (dolly, crane, handheld, push-in, pull-out, orbit), "
            f"lens choice (wide, normal, telephoto, anamorphic), "
            f"lighting setup (three-point, chiaroscuro, natural, motivated, volumetric), "
            f"composition (rule of thirds, leading lines, symmetry, negative space). "
            f"References: Roger Deakins, Emmanuel Lubezki, Christopher Doyle, "
            f"Hoyte van Hoytema, Gregory Crewdson, anime cinematography."
        )

        results = await self._search(query, num_results=num_results)
        cine_refs = []

        for r in results:
            cine_refs.append(CinematographyRef(
                title=r.get("title", "Unknown"),
                url=r.get("url", ""),
                snippet=r.get("snippet", ""),
                source=r.get("source", "web"),
                relevance_score=r.get("score", 0.0),
                camera_move=self._extract_camera_move(r.get("snippet", "")),
                lens=self._extract_lens(r.get("snippet", "")),
                lighting=self._extract_lighting(r.get("snippet", "")),
                composition=self._extract_composition(r.get("snippet", "")),
            ))

        return cine_refs

    async def search_color_palettes(
        self,
        mood: str,
        era: str = "",
        director: str = "",
        num_results: int = 5,
    ) -> list[ColorPalette]:
        """Search for color palettes by mood, era, or director."""
        query_parts = [f"color palette {mood}"]
        if era:
            query_parts.append(f"era {era}")
        if director:
            query_parts.append(f"director {director}")
        query_parts.append("hex codes RGB values color theory mood board")
        query = " ".join(query_parts)

        results = await self._search(query, num_results=num_results)
        palettes = []

        for r in results:
            hex_colors = self._extract_hex_colors(r.get("snippet", ""))

            palettes.append(ColorPalette(
                name=r.get("title", "Unknown"),
                url=r.get("url", ""),
                snippet=r.get("snippet", ""),
                source=r.get("source", "web"),
                relevance_score=r.get("score", 0.0),
                hex_colors=hex_colors,
                mood=mood,
                era=era,
                director=director,
            ))

        return palettes

    async def deep_research(self, topic: str, max_depth: int = 3) -> dict:
        """Run Parallel deep research for comprehensive topic analysis."""
        if not self._client:
            raise ParallelSearchError("Client not initialized.")

        payload = {
            "topic": topic,
            "max_depth": max_depth,
            "output_format": "structured",
        }

        resp = await self._client.post(PARALLEL_DEEP_RESEARCH_ENDPOINT, json=payload)
        if resp.status_code != 200:
            raise ParallelSearchError(f"Deep research failed: {resp.status_code}")

        return resp.json()

    # --- Extraction helpers ---

    def _extract_visual_elements(self, text: str) -> list[str]:
        keywords = [
            "cel-shaded", "line art", "flat shading", "gradient shading",
            "watercolor", "oil paint", "digital painting", "vector art",
            "silhouette", "rim light", "bloom", "lens flare", "particles",
            "atmospheric perspective", "depth of field", "motion lines",
            "speed lines", "impact frames", "sakuga", "key animation",
        ]
        found = []
        text_lower = text.lower()
        for kw in keywords:
            if kw in text_lower:
                found.append(kw)
        return found[:8]

    def _extract_color_notes(self, text: str) -> str:
        color_terms = [
            "pastel", "neon", "muted", "vibrant", "monochrome", "duotone",
            "complementary", "analogous", "triadic", "warm", "cool",
            "golden hour", "blue hour", "magic hour", "twilight", "dawn",
            "noir", "high key", "low key", "chiaroscuro", "tenebrism",
        ]
        found = [t for t in color_terms if t in text.lower()]
        return ", ".join(found[:5])

    def _extract_cinematography_notes(self, text: str) -> str:
        cine_terms = [
            "wide shot", "close up", "extreme close up", "medium shot",
            "long shot", "establishing shot", "dutch angle", "low angle",
            "high angle", "bird's eye", "worm's eye", "over the shoulder",
            "point of view", "rack focus", "pull focus", "zoom", "dolly zoom",
        ]
        found = [t for t in cine_terms if t in text.lower()]
        return ", ".join(found[:4])

    def _extract_camera_move(self, text: str) -> str:
        moves = [
            "push in", "pull out", "dolly in", "dolly out", "truck left",
            "truck right", "pedestal up", "pedestal down", "crane up",
            "crane down", "jib arm", "orbital", "arc shot", "360 degree",
            "handheld", "steadycam", "gimbal", "drone", "aerial",
            "rack focus", "whip pan", "swish pan", "snap zoom",
        ]
        text_lower = text.lower()
        for m in moves:
            if m in text_lower:
                return m
        return ""

    def _extract_lens(self, text: str) -> str:
        lenses = [
            "14mm", "16mm", "20mm", "24mm", "28mm", "35mm", "50mm",
            "85mm", "100mm", "135mm", "200mm", "anamorphic", "wide angle",
            "normal lens", "telephoto", "macro", "fisheye", "tilt-shift",
        ]
        text_lower = text.lower()
        for l in lenses:
            if l in text_lower:
                return l
        return ""

    def _extract_lighting(self, text: str) -> str:
        lighting = [
            "three-point", "key light", "fill light", "rim light", "backlight",
            "chiaroscuro", "Rembrandt", "butterfly", "loop", "split",
            "high key", "low key", "natural light", "golden hour", "blue hour",
            "volumetric", "god rays", "crepuscular", "practical", "motivated",
            "neon", "fluorescent", "tungsten", "HMI", "LED", "softbox",
        ]
        found = [l for l in lighting if l in text.lower()]
        return ", ".join(found[:3])

    def _extract_composition(self, text: str) -> str:
        comp = [
            "rule of thirds", "golden ratio", "fibonacci", "leading lines",
            "symmetry", "asymmetry", "negative space", "frame within frame",
            "centered", "off-center", "diagonal", "triangular", "circular",
            "layered", "foreground interest", "silhouette", "reflection",
        ]
        found = [c for c in comp if c in text.lower()]
        return ", ".join(found[:3])

    def _extract_hex_colors(self, text: str) -> list[str]:
        import re
        hex_pattern = r'#[0-9a-fA-F]{6}'
        matches = re.findall(hex_pattern, text)
        return list(dict.fromkeys(matches))[:8]


# --- MCP Tool Definitions (for agent tool calling) ---

MCP_TOOLS = [
    {
        "name": "parallel_search_style_refs",
        "description": "Search for anime/style visual references for a shot. Returns style references with visual elements, color notes, and cinematography notes for prompt steering.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "shot_description": {"type": "string", "description": "Description of the shot (e.g., 'dim room with 4D portal, character silhouette against volumetric light')"},
                "anime_style": {"type": "string", "description": "Target anime style (e.g., 'cel-shaded', 'Makoto Shinkai', 'Studio Ghibli', 'Kyoto Animation')", "default": "cel-shaded anime"},
                "num_results": {"type": "integer", "description": "Number of results to return", "default": 5},
            },
            "required": ["shot_description"],
        },
    },
    {
        "name": "parallel_search_cinematography_refs",
        "description": "Search for cinematography references (camera moves, lenses, lighting, composition) for a shot type.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "shot_type": {"type": "string", "description": "Type of shot (e.g., 'push-in on character face', 'orbital around 4D portal', 'establishing shot of mandala city')"},
                "mood": {"type": "string", "description": "Cinematic mood (e.g., 'cinematic', 'intimate', 'epic', 'surreal', 'noir')", "default": "cinematic"},
                "num_results": {"type": "integer", "description": "Number of results to return", "default": 5},
            },
            "required": ["shot_type"],
        },
    },
    {
        "name": "parallel_search_color_palettes",
        "description": "Search for color palettes by mood, era, or director. Returns hex codes for prompt steering.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "mood": {"type": "string", "description": "Mood/feeling (e.g., 'melancholic twilight', 'hopeful dawn', 'cyberpunk neon', 'warm nostalgia')"},
                "era": {"type": "string", "description": "Era/period (e.g., '1990s anime', '2000s digital', 'modern', 'retro')", "default": ""},
                "director": {"type": "string", "description": "Director reference (e.g., 'Makoto Shinkai', 'Hayao Miyazaki', 'Satoshi Kon', 'Mamoru Hosoda')", "default": ""},
                "num_results": {"type": "integer", "description": "Number of results to return", "default": 5},
            },
            "required": ["mood"],
        },
    },
    {
        "name": "parallel_deep_research",
        "description": "Run deep research on a topic for comprehensive analysis (e.g., 'anime cel-shading techniques 2020-2024', '4D portal visual effects in anime').",
        "inputSchema": {
            "type": "object",
            "properties": {
                "topic": {"type": "string", "description": "Research topic"},
                "max_depth": {"type": "integer", "description": "Research depth (1-5)", "default": 3},
            },
            "required": ["topic"],
        },
    },
]


# --- Synchronous wrapper for non-async contexts ---

def search_style_refs_sync(
    shot_description: str,
    anime_style: str = "cel-shaded anime",
    num_results: int = 5,
) -> list[StyleRef]:
    """Synchronous wrapper for style ref search."""
    api_key = os.getenv("PARALLEL_API_KEY", "").strip()
    if not api_key:
        raise ParallelConfigError("PARALLEL_API_KEY not set")

    async def _run():
        async with ParallelMCPClient(api_key) as client:
            return await client.search_style_refs(shot_description, anime_style, num_results)

    return asyncio.run(_run())


def search_cinematography_refs_sync(
    shot_type: str,
    mood: str = "cinematic",
    num_results: int = 5,
) -> list[CinematographyRef]:
    """Synchronous wrapper for cinematography ref search."""
    api_key = os.getenv("PARALLEL_API_KEY", "").strip()
    if not api_key:
        raise ParallelConfigError("PARALLEL_API_KEY not set")

    async def _run():
        async with ParallelMCPClient(api_key) as client:
            return await client.search_cinematography_refs(shot_type, mood, num_results)

    return asyncio.run(_run())


def search_color_palettes_sync(
    mood: str,
    era: str = "",
    director: str = "",
    num_results: int = 5,
) -> list[ColorPalette]:
    """Synchronous wrapper for color palette search."""
    api_key = os.getenv("PARALLEL_API_KEY", "").strip()
    if not api_key:
        raise ParallelConfigError("PARALLEL_API_KEY not set")

    async def _run():
        async with ParallelMCPClient(api_key) as client:
            return await client.search_color_palettes(mood, era, director, num_results)

    return asyncio.run(_run())