"""Tests for abstract lattice polish defaults."""

from app.lattice_polish_defaults import (
    LATTICE_POLISH_DEFAULT_PROMPT,
    LATTICE_POLISH_DEFAULT_STRENGTH,
    looks_like_lattice_prompt,
    resolve_lattice_polish_prompt,
    resolve_lattice_polish_strength,
)


def test_looks_like_lattice_prompt():
    assert looks_like_lattice_prompt("cyan glass tesseract lattice")
    assert looks_like_lattice_prompt("chrome neural mandala")
    assert not looks_like_lattice_prompt("portrait of a person")
    assert not looks_like_lattice_prompt("")


def test_resolve_lattice_polish_prompt():
    assert resolve_lattice_polish_prompt("custom", lattice=True) == "custom"
    assert (
        resolve_lattice_polish_prompt(None, lattice=True) == LATTICE_POLISH_DEFAULT_PROMPT
    )
    assert resolve_lattice_polish_prompt("", lattice=False) is None
    assert "glass-and-chrome" in LATTICE_POLISH_DEFAULT_PROMPT
    assert "no faces" in LATTICE_POLISH_DEFAULT_PROMPT


def test_resolve_lattice_polish_strength():
    assert resolve_lattice_polish_strength(0.7, lattice=True, default_strength=0.45) == 0.7
    assert (
        resolve_lattice_polish_strength(None, lattice=True, default_strength=0.55)
        == LATTICE_POLISH_DEFAULT_STRENGTH
    )
    assert resolve_lattice_polish_strength(None, lattice=False, default_strength=0.5) == 0.5
