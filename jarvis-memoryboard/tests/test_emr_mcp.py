"""MCP stdio adapter tests for EMR recall + write tools."""

from __future__ import annotations

import json
from unittest.mock import patch

from mcp_server.emr_stdio import EMR_RECALL_TOOL, handle_message, handle_tools_call
from mcp_server.protocol import MCP_TOOLS


def test_emr_recall_tool_schema():
    assert EMR_RECALL_TOOL["name"] == "emr_recall"
    assert "intent" in EMR_RECALL_TOOL["inputSchema"]["properties"]
    assert "query" in EMR_RECALL_TOOL["inputSchema"]["properties"]


def test_tools_list_includes_three():
    captured: list[dict] = []

    def fake_send(msg: dict) -> None:
        captured.append(msg)

    with patch("mcp_server.emr_stdio._send", fake_send):
        handle_message({"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}})

    names = [t["name"] for t in captured[0]["result"]["tools"]]
    assert names == ["emr_recall", "emr_remember", "emr_upsert"]
    assert len(MCP_TOOLS) == 3


def test_tools_call_proxies_to_http():
    fake_response = {
        "protocol": "emr-recall-v1",
        "bundle": [],
        "abstained": True,
        "abstention_reason": "no-candidates",
        "conflicts": [],
    }
    with patch("mcp_server.emr_stdio.call_emr_tool", return_value=fake_response):
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


def test_tools_call_remember_happy_path():
    fake_response = {
        "protocol": "emr-write-v1",
        "accepted": True,
        "refused": False,
        "memory": {"id": "mem-abc", "status": "draft"},
        "provenance": {"id": "mem-abc", "status": "draft"},
    }
    with patch("mcp_server.emr_stdio.call_emr_tool", return_value=fake_response) as mocked:
        result = handle_tools_call(
            {
                "name": "emr_remember",
                "arguments": {
                    "content": "Store this preference for signatures.",
                    "session_id": "s1",
                    "type": "preference",
                    "user_requested": True,
                },
            }
        )
    assert result["isError"] is False
    assert result["structuredContent"]["accepted"] is True
    mocked.assert_called_once()
    assert mocked.call_args[0][0] == "emr_remember"


def test_tools_call_unknown_tool():
    result = handle_tools_call({"name": "other_tool", "arguments": {}})
    assert result["isError"] is True
