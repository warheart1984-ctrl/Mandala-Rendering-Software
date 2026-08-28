"""MCP stdio adapter tests for emr_recall."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from mcp_server.emr_stdio import EMR_RECALL_TOOL, handle_message, handle_tools_call


def test_emr_recall_tool_schema():
    assert EMR_RECALL_TOOL["name"] == "emr_recall"
    assert "intent" in EMR_RECALL_TOOL["inputSchema"]["properties"]
    assert "query" in EMR_RECALL_TOOL["inputSchema"]["properties"]


def test_tools_list():
    captured: list[dict] = []

    def fake_send(msg: dict) -> None:
        captured.append(msg)

    with patch("mcp_server.emr_stdio._send", fake_send):
        handle_message({"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}})

    assert captured[0]["result"]["tools"][0]["name"] == "emr_recall"


def test_tools_call_proxies_to_http():
    fake_response = {
        "protocol": "emr-recall-v1",
        "bundle": [],
        "abstained": True,
        "abstention_reason": "no-candidates",
        "conflicts": [],
    }
    with patch("mcp_server.emr_stdio.call_emr_recall", return_value=fake_response):
        result = handle_tools_call(
            {
                "name": "emr_recall",
                "arguments": {"intent": "code", "query": "test query"},
            }
        )
    assert result["isError"] is False
    assert result["structuredContent"]["abstained"] is True
    payload = json.loads(result["content"][0]["text"])
    assert payload["protocol"] == "emr-recall-v1"


def test_tools_call_unknown_tool():
    result = handle_tools_call({"name": "other_tool", "arguments": {}})
    assert result["isError"] is True
