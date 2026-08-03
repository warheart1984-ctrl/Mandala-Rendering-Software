"""One-shot: restore original api-keys version into authorizer JSON shape + smoke. Do not commit."""
from __future__ import annotations

import json
import os
import secrets
import subprocess
import tempfile
import urllib.error
import urllib.request


def aws_text(args: list[str]) -> str:
    return subprocess.check_output(["aws", *args], text=True).strip()


def put_secret(payload_obj: dict) -> None:
    payload = json.dumps(payload_obj)
    fd, path = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    try:
        with open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload)
        file_uri = "file://" + path.replace("\\", "/")
        subprocess.check_call(
            [
                "aws",
                "secretsmanager",
                "put-secret-value",
                "--secret-id",
                "mrs-rt4d-dev/api-keys",
                "--region",
                "us-east-2",
                "--secret-string",
                file_uri,
            ]
        )
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def main() -> None:
    # Original create version (plain key string before mangled puts)
    original_version = "fd2d49b7-a2d5-4e85-916b-3efd100431d2"
    raw = aws_text(
        [
            "secretsmanager",
            "get-secret-value",
            "--secret-id",
            "mrs-rt4d-dev/api-keys",
            "--version-id",
            original_version,
            "--region",
            "us-east-2",
            "--query",
            "SecretString",
            "--output",
            "text",
        ]
    )

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict) and parsed.get("keys"):
            key = str(parsed["keys"][0])
        elif isinstance(parsed, dict) and parsed.get("api_key"):
            key = str(parsed["api_key"])
        elif isinstance(parsed, str):
            key = parsed
        else:
            key = raw.strip()
    except json.JSONDecodeError:
        key = raw.strip()

    if key.startswith("{") or "api_key" in key or len(key) < 16 or " " in key:
        key = "dev-test-key-" + secrets.token_urlsafe(24)
        print("SECRET_STATUS=minted_new_key")
    else:
        print("SECRET_STATUS=restored_original_version")

    put_secret({"keys": [key]})

    verify = json.loads(
        aws_text(
            [
                "secretsmanager",
                "get-secret-value",
                "--secret-id",
                "mrs-rt4d-dev/api-keys",
                "--region",
                "us-east-2",
                "--query",
                "SecretString",
                "--output",
                "text",
            ]
        )
    )
    key = verify["keys"][0]
    print(
        "FIXED_KEY_LEN=%d starts_brace=%s alnumish=%s"
        % (
            len(key),
            key.startswith("{"),
            key.replace("-", "").replace("_", "").isalnum(),
        )
    )

    mcp_url = "https://zs8hkz982h.execute-api.us-east-2.amazonaws.com/dev/mcp"

    def post(method: str, params: dict, request_id: int) -> None:
        body = json.dumps(
            {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
        ).encode()
        req = urllib.request.Request(
            mcp_url,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
            },
        )
        label = method.replace("/", "_").upper()
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = resp.read().decode("utf-8", "replace")
                print(f"{label}_STATUS={resp.status}")
                print(f"{label}_BODY={data[:500]}")
        except urllib.error.HTTPError as exc:
            data = exc.read().decode("utf-8", "replace")
            print(f"{label}_STATUS={exc.code}")
            print(f"{label}_BODY={data[:500]}")

    post(
        "initialize",
        {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "mrs-smoke", "version": "0.1.0"},
        },
        1,
    )
    post("tools/list", {}, 2)


if __name__ == "__main__":
    main()
