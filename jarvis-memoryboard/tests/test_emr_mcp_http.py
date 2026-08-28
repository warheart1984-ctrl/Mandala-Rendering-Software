"""Streamable HTTP MCP transport tests — POST /mcp."""

from __future__ import annotations

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store import JarvisStore, reset_store_for_tests


@pytest.fixture(autouse=True)
def _fresh_store(monkeypatch):
    reset_store_for_tests()
    tmp = Path(tempfile.mktemp(suffix=".json"))
    store = JarvisStore(str(tmp))
    monkeypatch.delenv("EMR_RECALL_API_KEY", raising=False)
    with patch("app.main.get_store", return_value=store):
        yield


client = TestClient(app)

MCP_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}


def test_mcp_initialize():
    resp = client.post(
        "/mcp",
        headers=MCP_HEADERS,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "1.0"},
            },
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["result"]["protocolVersion"] == "2025-03-26"
    assert body["result"]["serverInfo"]["name"] == "jarvis-emr"
    assert "Mcp-Session-Id" in resp.headers or "mcp-session-id" in resp.headers


def test_mcp_tools_list():
    init = client.post(
        "/mcp",
        headers=MCP_HEADERS,
        json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
    )
    session = init.headers.get("mcp-session-id") or init.headers.get("Mcp-Session-Id")
    headers = {**MCP_HEADERS}
    if session:
        headers["Mcp-Session-Id"] = session

    resp = client.post(
        "/mcp",
        headers=headers,
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
    )
    assert resp.status_code == 200
    tools = resp.json()["result"]["tools"]
    names = [t["name"] for t in tools]
    assert names == ["emr_recall", "emr_remember", "emr_upsert"]
    assert tools[0]["annotations"]["readOnlyHint"] is True
    assert tools[1]["annotations"]["readOnlyHint"] is False


def test_mcp_tools_call_emr_recall():
    resp = client.post(
        "/mcp",
        headers=MCP_HEADERS,
        json={
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "emr_recall",
                "arguments": {"intent": "code", "query": "test recall query"},
            },
        },
    )
    assert resp.status_code == 200
    result = resp.json()["result"]
    assert result["isError"] is False
    assert result["structuredContent"]["protocol"] == "emr-recall-v1"
    assert "abstained" in result["structuredContent"]


def test_mcp_tools_call_emr_remember(monkeypatch):
    monkeypatch.setenv("JARVIS_MCP_WRITE_ENABLED", "true")
    resp = client.post(
        "/mcp",
        headers=MCP_HEADERS,
        json={
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {
                "name": "emr_remember",
                "arguments": {
                    "content": "Prefer high-contrast cinematic lighting.",
                    "session_id": "mcp-sess",
                    "type": "preference",
                    "subject": "creative-style",
                    "user_requested": True,
                    "user_statement": "Remember my lighting preference",
                },
            },
        },
    )
    assert resp.status_code == 200
    result = resp.json()["result"]
    assert result["isError"] is False
    body = result["structuredContent"]
    assert body["protocol"] == "emr-write-v1"
    assert body["accepted"] is True
    assert body["memory"]["status"] == "draft"


def test_mcp_unknown_tool():
    resp = client.post(
        "/mcp",
        headers=MCP_HEADERS,
        json={
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {"name": "write_memory", "arguments": {}},
        },
    )
    assert resp.status_code == 200
    assert resp.json()["result"]["isError"] is True


def test_mcp_requires_auth_when_key_set(monkeypatch):
    monkeypatch.setenv("EMR_RECALL_API_KEY", "secret-key")
    resp = client.post(
        "/mcp",
        headers=MCP_HEADERS,
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
    )
    assert resp.status_code == 401

    resp = client.post(
        "/mcp",
        headers={**MCP_HEADERS, "Authorization": "Bearer secret-key"},
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
    )
    assert resp.status_code == 200


def test_mcp_get_not_supported():
    resp = client.get("/mcp", headers={"Accept": "text/event-stream"})
    assert resp.status_code == 405
