"""Strip trailing user meta-commentary from image prompts.

Users sometimes append feedback like \"Ok this not good.\" into the same
textarea as the generation prompt. That junk is sent to FLUX and can push
already-fragile photoreal prompts toward blank/refusal outputs.
"""

from __future__ import annotations

import re

# Trailing sentences that are commentary about the prompt, not scene content.
_META_TRAILING = re.compile(
    r"""
    (?:
      [\s.!?]*                                   # trailing punctuation/space
      (?:
        ok[, ]*\s*this\s+(?:is\s+)?not\s+good
        | this\s+(?:is\s+)?(?:not|no)\s+good
        | (?:this\s+)?(?:doesn'?t|does\s+not)\s+work
        | (?:please\s+)?try\s+again
        | bad\s+prompt
        | ignore\s+(?:the\s+)?(?:above|previous)
        | make\s+it\s+better
        | redo\s+(?:this|it)
        | not\s+what\s+i\s+(?:wanted|asked)
      )
      [\s.!?]*
    )+
    \s*$
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Collapse repeated accidental words ("glowing glowing") lightly.
_DUP_WORD = re.compile(r"\b(\w{4,})\s+\1\b", re.IGNORECASE)


def sanitize_prompt(prompt: str) -> str:
    """Return prompt with trailing meta-commentary removed and light cleanup.

    Does not invent scene content — only strips junk and collapses obvious
    duplicated words. Empty after sanitize raises ValueError upstream.
    """
    text = (prompt or "").strip()
    if not text:
        return ""

    cleaned = _META_TRAILING.sub("", text).strip()
    # One pass of duplicate-word collapse (glowing glowing → glowing).
    cleaned = _DUP_WORD.sub(r"\1", cleaned)
    # Normalize whitespace but keep intentional newlines as spaces.
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,;.")
    return cleaned.strip()
