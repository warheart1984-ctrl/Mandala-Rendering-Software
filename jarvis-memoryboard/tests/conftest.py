"""Shared test isolation — EMR dynamics sidecar must never touch repo data/."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

import app.emr as emr
import app.amul as amul
import app.amul_gc as amul_gc
import app.amul_rag as rag
import app.amul_llm as llm


@pytest.fixture(autouse=True)
def _isolated_dynamics_sidecar(tmp_path):
    """Point EMR/AMUL/RAG/LLM storage at per-test temp files.

    Unit tests must not read or write real data/ files, and must never hit
    the real LLM backend; adapter behavior is covered with explicit patches.
    """
    sidecar = Path(tempfile.mktemp(suffix="-dynamics.json", dir=str(tmp_path)))
    original = emr.DYNAMICS_PATH
    emr.DYNAMICS_PATH = str(sidecar)
    emr._dynamics_loaded = False  # force reload against isolated path

    amul_path = Path(tempfile.mktemp(suffix="-field.jsonl", dir=str(tmp_path)))
    original_field_path = amul.FIELD_PATH
    amul.FIELD_PATH = str(amul_path)
    amul.reset_field_for_tests()

    rag_docs = Path(tempfile.mktemp(suffix="-ragdocs.jsonl", dir=str(tmp_path)))
    rag_log = Path(tempfile.mktemp(suffix="-raglog.jsonl", dir=str(tmp_path)))
    original_rag_paths = (rag.RAG_DOCS_PATH, rag.RAG_LOG_PATH)
    rag.RAG_DOCS_PATH, rag.RAG_LOG_PATH = str(rag_docs), str(rag_log)
    rag.reset_index_for_tests()

    llm_log = Path(tempfile.mktemp(suffix="-llmlog.jsonl", dir=str(tmp_path)))
    original_llm_paths = (llm.LLM_LOG_PATH, llm.LLM_URL)
    llm.LLM_LOG_PATH = str(llm_log)
    llm.LLM_URL = ""  # force echo-stub path; backend tested via explicit patch

    gc_cps = Path(tempfile.mktemp(suffix="-checkpoints.jsonl", dir=str(tmp_path)))
    original_gc_path = amul_gc.CHECKPOINTS_PATH
    amul_gc.CHECKPOINTS_PATH = str(gc_cps)

    yield
    emr.DYNAMICS_PATH = original
    emr._dynamics_loaded = False
    amul.FIELD_PATH = original_field_path
    amul.reset_field_for_tests()
    rag.RAG_DOCS_PATH, rag.RAG_LOG_PATH = original_rag_paths
    rag.reset_index_for_tests()
    llm.LLM_LOG_PATH, llm.LLM_URL = original_llm_paths
    emr.reset_stm_for_tests()
