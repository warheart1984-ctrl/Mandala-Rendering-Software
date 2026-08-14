"""SD-CPP + Whisper <-> Lemonade API bridge (standalone, stdlib only).

Listens on :13305 and routes to local backends:

    /api/v1/images/*  /v1/*  /sdapi/v1/*     -> stable-diffusion.cpp sd-server  (127.0.0.1:13306)
    /api/v1/audio/transcriptions             -> whisper.cpp whisper-server      (127.0.0.1:13312)
    /api/v1/chat/*  /api/v1/audio/speech  -> LemonadeServer                    (127.0.0.1:13307)
    /health, /api/v1/health                  -> aggregated status

Why it exists: the bundled Lemonade sd-cpp backend crashes on CPUs without
AVX2 (FX-8350) and cannot run SD on the RX 580; its bundled whispercpp also
crashes (whisper-server is AVX2-compiled). We build stable-diffusion.cpp and
whisper.cpp from source (baseline x64 + Vulkan) and serve them separately; this
bridge keeps the public endpoint (127.0.0.1:13305) and the OpenAI schema that
downstream tools (genblaze lemonade_provider, lemonade examples, etc.) expect.

Routing rules:
  - Images always go to sd-server. Its OpenAI route ignores `steps`/`cfg_scale`
    from the JSON body, so the server must be started with --steps 4 --cfg-scale
    1.0 (see start_all.bat). `size` and `n` ARE honored.
  - STT (audio/transcriptions) goes to whisper-server with a path rewrite to
    /inference (whisper.cpp's OpenAI-compatible endpoint).
  - Everything else is passed through to LemonadeServer unchanged (same path).
  - Unknown paths: try lemonade first, then sd-server; 404 if neither answers.

Run:  python bridge.py            (bind 0.0.0.0:13305 by default)
Env:   BRIDGE_HOST  BRIDGE_PORT   SD_PORT=13306  LEMONADE_PORT=13307  WHISPER_PORT=13312
"""

from __future__ import annotations

import base64
import http.client
import json
import math
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import governed_image

SD_PORT = int(os.getenv("SD_PORT", "13306"))
LEM_PORT = int(os.getenv("LEMONADE_PORT", "13307"))
WHISPER_PORT = int(os.getenv("WHISPER_PORT", "13312"))
BRIDGE_HOST = os.getenv("BRIDGE_HOST", "0.0.0.0")
BRIDGE_PORT = int(os.getenv("BRIDGE_PORT", "13305"))
IMG_TIMEOUT = 600.0
GEN_TIMEOUT = 900.0

# sd-server self-healing: path to the from-source Vulkan build and its model,
# so the bridge can auto-restart sd-server (it deterministically crashes with
# 0xc0000409 when its cpp-httplib keep-alive handling chokes on the bridge's
# threaded connections). Set via start_all.bat.
SD_EXE = os.getenv("SD_EXE", "").strip()
SD_MODEL = os.getenv("SD_MODEL", "").strip()
SD_LOGS = os.getenv("SD_LOGS", os.path.dirname(os.path.abspath(__file__))).strip()
SD_RESTART_LOCK = threading.Lock()
SD_RESTART_DEBOUNCE_S = 15.0
SD_START_WAIT_S = 75.0
_last_sd_restart = 0.0

# Cloud image backends (optional; empty CLOUD_BACKEND = local sd-server only).
CLOUD_BACKEND = os.getenv("CLOUD_BACKEND", "").strip().lower()
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_BASE_URL = os.getenv(
    "NVIDIA_BASE_URL",
    "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv(
    "OPENAI_BASE_URL", "https://api.together.xyz/v1/images/generations"
)
FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY", "") or OPENAI_API_KEY
FIREWORKS_BASE_URL = os.getenv(
    "FIREWORKS_BASE_URL",
    "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image",
)
CLOUD_MODEL = os.getenv("CLOUD_MODEL", "")
CLOUD_STEPS = int(os.getenv("CLOUD_STEPS", "4"))
OUTPUT_DIR = os.getenv(
    "OUTPUT_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs")
)

# Optional .env loader (same dir as this script). Plain KEY=VALUE lines, no
# quotes, no export. Never commit this file (already git-ignored). File wins
# over process env (dotenv semantics).
_ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(_ENV_FILE):
    for _line in open(_ENV_FILE, "r", encoding="utf-8"):
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ[_k.strip()] = _v.strip()

# Re-read now that .env may have provided values.
CLOUD_BACKEND = os.getenv("CLOUD_BACKEND", "").strip().lower()
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_BASE_URL = os.getenv(
    "NVIDIA_BASE_URL",
    "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv(
    "OPENAI_BASE_URL", "https://api.together.xyz/v1/images/generations"
)
FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY", "") or OPENAI_API_KEY
FIREWORKS_BASE_URL = os.getenv(
    "FIREWORKS_BASE_URL",
    "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image",
)
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_MODEL = os.getenv(
    "CLOUDFLARE_MODEL", "@cf/black-forest-labs/flux-1-schnell"
)
CLOUD_MODEL = os.getenv("CLOUD_MODEL", "")
CLOUD_STEPS = int(os.getenv("CLOUD_STEPS", "4"))
OUTPUT_DIR = os.getenv(
    "OUTPUT_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs")
)
SD_EXE = os.getenv("SD_EXE", "").strip()
SD_MODEL = os.getenv("SD_MODEL", "").strip()
SD_LOGS = os.getenv("SD_LOGS", os.path.dirname(os.path.abspath(__file__))).strip()

LOG_LOCK = threading.Lock()

# Browser-like UA so Cloudflare-protected providers (Fireworks, ...) don't
# 403 on urllib's default "Python-urllib/3.x" user agent.
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

UI_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MRS Local SD Bridge</title>
<style>
  :root { color-scheme: dark; }
  body { font: 14px/1.5 system-ui, sans-serif; background: #0d1117; color: #e6edf3; margin: 0; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #8b949e; font-size: 13px; margin-bottom: 16px; }
  textarea { width: 100%; min-height: 84px; box-sizing: border-box; background: #161b22;
    color: #e6edf3; border: 1px solid #30363d; border-radius: 8px; padding: 10px;
    font: inherit; resize: vertical; }
  .row { display: flex; gap: 12px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
  select, button { background: #21262d; color: #e6edf3; border: 1px solid #30363d;
    border-radius: 8px; padding: 8px 12px; font: inherit; }
  button { background: #238636; border-color: #2ea043; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .55; cursor: wait; }
  button.gray { background: #21262d; border-color: #30363d; }
  #status { color: #8b949e; font-size: 13px; margin: 10px 0; }
  #imgbox { margin-top: 12px; text-align: center; }
  img { max-width: 100%; border-radius: 10px; border: 1px solid #30363d; }
  a { color: #58a6ff; }
  .err { color: #f85149; }
  .ok { color: #3fb950; }
</style>
</head>
<body>
<div class="wrap">
  <h1>MRS Local SD Bridge</h1>
  <div class="sub">stable-diffusion.cpp on the RX 580 &middot; SD-Turbo &middot; 4 steps &middot; cfg 1.0</div>
  <textarea id="prompt" placeholder="Describe an image..."></textarea>
  <div class="row">
    <select id="size">
      <option value="512x512">512x512 (max on RX 580)</option>
    </select>
    <select id="n">
      <option value="1">1 image</option>
      <option value="2">2 images</option>
      <option value="4">4 images</option>
    </select>
    <button id="go">Generate</button>
    <button id="save" class="gray" disabled>Save PNG</button>
  </div>
  <div id="status"></div>
  <div id="imgbox"></div>
</div>
<script>
const $ = (id) => document.getElementById(id);
let lastImg = null;
function status(txt, cls) { const el = $("status"); el.className = cls || ""; el.textContent = txt; }
async function generate() {
  const prompt = $("prompt").value.trim();
  if (!prompt) { status("Enter a prompt first.", "err"); return; }
  const go = $("go"), save = $("save");
  go.disabled = true; save.disabled = true; $("imgbox").innerHTML = "";
  const t0 = performance.now();
  status("Generating...");
  try {
    const r = await fetch("/api/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "SD-Turbo", prompt, size: $("size").value,
        response_format: "b64_json", n: parseInt($("n").value) }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    status("Done in " + secs + "s", "ok");
    const box = $("imgbox");
    data.data.forEach((d, i) => {
      const img = new Image();
      img.src = "data:" + (d.mime || "image/png") + ";base64," + d.b64_json;
      img.alt = prompt;
      if (i === 0) lastImg = img.src;
      box.appendChild(img);
    });
    save.disabled = false;
  } catch (e) { status("Error: " + e.message, "err"); }
  go.disabled = false;
}
function savePng() {
  if (!lastImg) return;
  const a = document.createElement("a");
  a.href = lastImg;
  a.download = "mandala-" + Date.now() + ".png";
  a.click();
}
$("go").onclick = generate;
$("save").onclick = savePng;
$("prompt").addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") generate(); });
</script>
</body>
</html>
"""

CHAT_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MRS Chat</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { font: 14px/1.55 system-ui, sans-serif; background: #0d1117; color: #e6edf3;
    margin: 0; height: 100vh; display: flex; flex-direction: column; }
  header { display: flex; align-items: center; gap: 10px; padding: 10px 16px;
    border-bottom: 1px solid #21262d; background: #161b22; }
  header h1 { font-size: 16px; margin: 0; }
  header .dot { width: 8px; height: 8px; border-radius: 50%; background: #3fb950; }
  header select { margin-left: auto; background: #21262d; color: #e6edf3;
    border: 1px solid #30363d; border-radius: 8px; padding: 5px 10px; font: inherit; }
  header button { background: #21262d; color: #e6edf3; border: 1px solid #30363d;
    border-radius: 8px; padding: 5px 12px; font: inherit; cursor: pointer; }
  main { flex: 1; overflow-y: auto; padding: 20px 0; }
  .msg { max-width: 780px; margin: 0 auto 14px; display: flex; gap: 12px; padding: 0 16px; }
  .msg .avatar { width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 15px; }
  .msg.user .avatar { background: #1f6feb; }
  .msg.assistant .avatar { background: #238636; }
  .bubble { background: #161b22; border: 1px solid #21262d; border-radius: 10px;
    padding: 10px 14px; white-space: pre-wrap; word-break: break-word; min-width: 0; }
  .msg.user .bubble { background: #1c2c47; border-color: #1f6feb33; }
  .bubble img { max-width: 100%; border-radius: 8px; margin-top: 8px; }
  .bubble .hint { color: #8b949e; font-size: 12px; }
  .bubble .err { color: #f85149; }
  .cursor::after { content: "\\25CF"; opacity: .5; animation: blink 1s steps(1) infinite;
    margin-left: 2px; font-size: 10px; vertical-align: middle; }
  @keyframes blink { 50% { opacity: 0; } }
  footer { border-top: 1px solid #21262d; background: #161b22; padding: 12px 16px; }
  .composer { max-width: 780px; margin: 0 auto; display: flex; gap: 10px; }
  textarea { flex: 1; resize: none; height: 46px; max-height: 160px; background: #0d1117;
    color: #e6edf3; border: 1px solid #30363d; border-radius: 10px; padding: 10px;
    font: inherit; }
  footer button { background: #238636; color: #fff; border: 1px solid #2ea043;
    border-radius: 10px; padding: 0 18px; font: inherit; font-weight: 600; cursor: pointer; }
  footer button:disabled { opacity: .55; cursor: wait; }
  .slash { color: #d29922; }
</style>
</head>
<body>
<header>
  <span class="dot" id="dot"></span>
  <h1>MRS Chat</h1>
  <select id="model"></select>
  <button id="clear" title="New conversation">New</button>
</header>
<main id="main"></main>
<footer>
  <div class="composer">
    <textarea id="input" placeholder="Message MRS...  (/imagine prompt  makes an image)"></textarea>
    <button id="send">Send</button>
  </div>
</footer>
<script>
const $ = (id) => document.getElementById(id);
const main = $("main"), input = $("input"), sendBtn = $("send"), dot = $("dot");
let history = [];

async function loadModels() {
  try {
    const r = await fetch("/api/v1/models");
    const data = await r.json();
    const sel = $("model");
    const ids = (data.data || []).map(m => m.id);
    if (ids.length) { ids.forEach(id => sel.add(new Option(id, id))); }
    else { sel.add(new Option("Llama-3.2-1B-Instruct-GGUF", "Llama-3.2-1B-Instruct-GGUF")); }
  } catch (e) { $("model").add(new Option("Llama-3.2-1B-Instruct-GGUF", "Llama-3.2-1B-Instruct-GGUF")); }
}

function addMessage(role, text, html) {
  const wrap = document.createElement("div");
  wrap.className = "msg " + role;
  const av = document.createElement("div");
  av.className = "avatar";
  av.textContent = role === "user" ? "U" : "M";
  const bub = document.createElement("div");
  bub.className = "bubble";
  if (text) bub.textContent = text;
  if (html) bub.innerHTML = html;
  wrap.appendChild(av);
  wrap.appendChild(bub);
  main.appendChild(wrap);
  main.scrollTop = main.scrollHeight;
  return bub;
}

function streamToElement(bub, reader) {
  return new Promise((resolve, reject) => {
    const dec = new TextDecoder();
    let buf = "", done = false;
    (function pump() {
      reader.read().then(({ value, done: d }) => {
        if (d) { done = true; resolve(); return; }
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\\n");
        buf = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") { done = true; resolve(); return; }
          try {
            const j = JSON.parse(payload);
            const delta = j.choices && j.choices[0] && j.choices[0].delta;
            if (delta && delta.content) bub.textContent += delta.content;
          } catch (e) {}
        }
        main.scrollTop = main.scrollHeight;
        pump();
      }).catch(reject);
    })();
  });
}

async function chat(text) {
  history.push({ role: "user", content: text });
  addMessage("user", text);
  const bub = addMessage("assistant", "");
  bub.classList.add("cursor");
  const body = { model: $("model").value, stream: true,
    messages: [{ role: "system", content: "You are MRS, a concise local assistant." }]
      .concat(history.slice(-12)) };
  try {
    const r = await fetch("/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) { bub.classList.remove("cursor"); bub.textContent = "HTTP " + r.status; throw new Error(String(r.status)); }
    if (r.body.getReader) {
      await streamToElement(bub, r.body.getReader());
    } else {
      const j = await r.json();
      bub.textContent = j.choices[0].message.content;
    }
  } catch (e) {
    if (!bub.textContent) { bub.textContent = "Error: " + e.message; bub.classList.add("err"); }
  } finally {
    bub.classList.remove("cursor");
    const content = bub.textContent;
    if (content) history.push({ role: "assistant", content });
  }
}

async function imagine(prompt) {
  addMessage("user", "/imagine " + prompt);
  const bub = addMessage("assistant", "");
  bub.textContent = "Generating image...";
  try {
    const r = await fetch("/api/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "SD-Turbo", prompt, size: "512x512",
        response_format: "b64_json", n: 1 }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
    bub.textContent = "";
    const img = new Image();
    img.src = "data:" + (data.data[0].mime || "image/png") + ";base64," + data.data[0].b64_json;
    img.alt = prompt;
    bub.appendChild(img);
    history.push({ role: "assistant", content: "[image: " + prompt + "]" });
  } catch (e) {
    bub.textContent = "Image error: " + e.message;
    bub.classList.add("err");
  }
}

async function send() {
  const text = input.value.trim();
  if (!text || sendBtn.disabled) return;
  input.value = "";
  sendBtn.disabled = true;
  try {
    const m = text.match(/^\\/imagine\\s+(.+)$/s);
    if (m) { await imagine(m[1]); }
    else { await chat(text); }
  } finally { sendBtn.disabled = false; input.focus(); }
}

sendBtn.onclick = send;
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
});
$("clear").onclick = () => { history = []; main.innerHTML = "";
  addMessage("assistant", "Fresh start. Ask me anything, or use /imagine <prompt> to render an image."); };

setInterval(async () => {
  try { const h = await fetch("/api/v1/health"); const j = await h.json();
    dot.style.background = j.status === "ok" ? "#3fb950" : "#d29922"; } catch (e) { dot.style.background = "#f85149"; }
}, 5000);

loadModels();
addMessage("assistant", "Hey, I\\u2019m MRS. Ask me anything, or use <b>/imagine</b> &lt;prompt&gt; to render an image with SD-Turbo.");
</script>
</body>
</html>
"""


def log(msg: str) -> None:
    with LOG_LOCK:
        sys.stderr.write(f"[bridge] {msg}\n")
        sys.stderr.flush()


def forward(method: str, path: str, body: bytes | None, port: int, timeout: float, ctype: str | None = None) -> tuple[int, str, bytes]:
    """Forward one request to an upstream HTTP/1.1 server and return its full response.

    Always sends ``Connection: close``: sd-server's cpp-httplib keep-alive
    handling deterministically crashes (0xc0000409) when the bridge's threaded
    connections attempt connection reuse. Closing per request sidesteps it.
    """
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    try:
        headers = {"Connection": "close"}
        if ctype:
            headers["Content-Type"] = ctype
        conn.request(method, path, body=body, headers=headers)
        resp = conn.getresponse()
        # http.client already decoded chunked transfer-encoding, so the payload
        # length is correct to re-send with Content-Length.
        payload = resp.read()
        return resp.status, resp.getheader("Content-Type", "application/octet-stream"), payload
    finally:
        conn.close()


def forward_stream(method: str, path: str, body: bytes | None, port: int, wfile) -> None:
    """Forward a request and relay the upstream response incrementally (SSE).

    Must be called after send_response/headers are set on the bridge side; this
    writes body chunks straight to the caller's response writer. Used for
    chat streaming (OpenAI-style server-sent events from Lemonade).
    """
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=GEN_TIMEOUT)
    try:
        conn.request(method, path, body=body, headers={"Connection": "close"})
        resp = conn.getresponse()
        while True:
            chunk = resp.read(4096)
            if not chunk:
                break
            wfile.write(chunk)
            wfile.flush()
    finally:
        conn.close()


def sd_healthy() -> bool:
    try:
        status, _, _ = forward("GET", "/v1/models", None, SD_PORT, 3.0)
        return status < 500
    except Exception:
        return False


def lemonade_healthy() -> bool:
    for path in ("/api/v1/health", "/health"):
        try:
            status, _, _ = forward("GET", path, None, LEM_PORT, 3.0)
            if status < 500:
                return status < 400
        except Exception:
            continue
    return False


def whisper_healthy() -> bool:
    try:
        status, _, _ = forward("GET", "/", None, WHISPER_PORT, 3.0)
        return status < 500
    except Exception:
        return False


# ---- sd-server watchdog ----------------------------------------------------
# sd-server has a deterministic crash (0xc0000409 fail-fast in ucrtbase.dll)
# on certain connection patterns. Rather than die, the bridge detects a dead
# sd-server, relaunches it, and waits for it to become healthy. Debounced so a
# concurrent image request can't trigger two restarts at once.

def _sd_cmd() -> list[str] | None:
    if not SD_EXE or not os.path.exists(SD_EXE):
        log(f"watchdog: SD_EXE not set or missing ({SD_EXE!r}); cannot restart")
        return None
    if not SD_MODEL or not os.path.exists(SD_MODEL):
        log(f"watchdog: SD_MODEL not set or missing ({SD_MODEL!r}); cannot restart")
        return None
    return [
        SD_EXE,
        "--listen-ip", "127.0.0.1",
        "--listen-port", str(SD_PORT),
        "--model", SD_MODEL,
        "--vae-tiling",
        "--steps", "4",
        "--cfg-scale", "1.0",
        "--sampling-method", "euler",
    ]


def _spawn_sd() -> None:
    global _last_sd_restart
    _last_sd_restart = time.time()
    cmd = _sd_cmd()
    if not cmd:
        return
    os.makedirs(SD_LOGS, exist_ok=True)
    log_path = os.path.join(SD_LOGS, f"sd-server-{int(time.time())}.log")
    log(f"watchdog: launching sd-server -> {log_path}")
    try:
        subprocess.Popen(
            cmd,
            stdout=open(log_path, "ab", buffering=0),
            stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception as exc:  # noqa: BLE001
        log(f"watchdog: failed to spawn sd-server: {exc!r}")


def ensure_sd() -> bool:
    """Guarantee sd-server is healthy: restart if needed, wait for readiness."""
    if sd_healthy():
        return True
    with SD_RESTART_LOCK:
        if sd_healthy():
            return True
        if time.time() - _last_sd_restart < SD_RESTART_DEBOUNCE_S:
            log("watchdog: sd-server down, restart debounce active")
            return False
        _spawn_sd()
        deadline = time.time() + SD_START_WAIT_S
        while time.time() < deadline:
            time.sleep(2.0)
            if sd_healthy():
                log("watchdog: sd-server recovered")
                return True
        log("watchdog: sd-server did not recover in time")
        return False


def ensure_sd_async() -> None:
    """Fire-and-forget restart if sd-server is down (debounced)."""
    if not sd_healthy():
        with SD_RESTART_LOCK:
            if not sd_healthy() and time.time() - _last_sd_restart >= SD_RESTART_DEBOUNCE_S:
                _spawn_sd()


# ---- cloud image backends --------------------------------------------------

def _http_post_json(url: str, payload: dict, headers: dict, timeout: float) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={**headers, "Content-Type": "application/json", "User-Agent": _UA},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        raise RuntimeError(f"cloud API HTTP {exc.code}: {detail}") from None
    except urllib.error.URLError as exc:
        raise RuntimeError(f"cloud API unreachable: {exc.reason}") from None


def _parse_size(size: str) -> tuple[int | None, int | None]:
    if size and "x" in size:
        try:
            w, h = size.lower().split("x")[:2]
            return int(w), int(h)
        except ValueError:
            pass
    return None, None


def _nim_generate(prompt: str, n: int, size: str) -> list[dict]:
    if not NVIDIA_API_KEY:
        raise RuntimeError("CLOUD_BACKEND=nvidiabuild but NVIDIA_API_KEY is not set")
    # Hosted FLUX NIM only supports its native resolutions; default 1024x1024.
    w, h = _parse_size(size)
    width = w if w in (768, 832, 896, 1024, 1152, 1216, 1344) else 1024
    height = h if h in (768, 832, 896, 1024, 1152, 1216, 1344) else 1024
    items: list[dict] = []
    for _ in range(n):
        data = _http_post_json(
            NVIDIA_BASE_URL,
            {"prompt": prompt, "steps": CLOUD_STEPS, "seed": 42, "width": width, "height": height},
            {"Authorization": f"Bearer {NVIDIA_API_KEY}"},
            GEN_TIMEOUT,
        )
        for artifact in data.get("artifacts") or []:
            items.append({"b64_json": artifact["base64"]})
    return items


def _openai_compat_generate(prompt: str, n: int, size: str) -> list[dict]:
    if not OPENAI_API_KEY:
        raise RuntimeError("CLOUD_BACKEND=openai but OPENAI_API_KEY is not set")
    model = CLOUD_MODEL or "black-forest-labs/FLUX.1-schnell"
    body: dict = {"model": model, "prompt": prompt, "n": n, "response_format": "b64_json"}
    if size and size != "512x512":
        body["size"] = size
    data = _http_post_json(
        OPENAI_BASE_URL, body, {"Authorization": f"Bearer {OPENAI_API_KEY}"}, GEN_TIMEOUT
    )
    items: list[dict] = []
    for entry in data.get("data") or []:
        if entry.get("b64_json"):
            items.append({"b64_json": entry["b64_json"]})
        elif entry.get("url"):
            with urllib.request.urlopen(entry["url"], timeout=GEN_TIMEOUT) as resp:
                items.append({"b64_json": base64.b64encode(resp.read()).decode("ascii")})
    return items


def _http_post_raw(url: str, payload: dict, headers: dict, timeout: float) -> bytes:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={**headers, "User-Agent": _UA},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        raise RuntimeError(f"cloud API HTTP {exc.code}: {detail}") from None
    except urllib.error.URLError as exc:
        raise RuntimeError(f"cloud API unreachable: {exc.reason}") from None


def _sniff_mime(raw: bytes) -> str:
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


def _aspect_ratio(size: str) -> str:
    w, h = _parse_size(size)
    if w and h:
        g = math.gcd(w, h)
        rw, rh = w // g, h // g
        if rw == rh:
            return "1:1"
        if (rw, rh) == (16, 9):
            return "16:9"
        if (rw, rh) == (9, 16):
            return "9:16"
        if (rw, rh) == (4, 3):
            return "4:3"
        if (rw, rh) == (3, 4):
            return "3:4"
        if (rw, rh) == (3, 2):
            return "3:2"
        if (rw, rh) == (2, 3):
            return "2:3"
        return f"{rw}:{rh}"
    return "1:1"


def _fireworks_generate(prompt: str, n: int, size: str) -> list[dict]:
    if not FIREWORKS_API_KEY:
        raise RuntimeError("CLOUD_BACKEND=fireworks but no Fireworks API key is set")
    payload = {
        "prompt": prompt,
        "aspect_ratio": _aspect_ratio(size),
        "guidance_scale": 1.0,
        "num_inference_steps": CLOUD_STEPS,
        "seed": 42,
    }
    headers = {
        "Authorization": f"Bearer {FIREWORKS_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "image/jpeg",
    }
    items: list[dict] = []
    for _ in range(n):
        raw = _http_post_raw(FIREWORKS_BASE_URL, payload, headers, GEN_TIMEOUT)
        items.append({"b64_json": base64.b64encode(raw).decode("ascii"), "mime": _sniff_mime(raw)})
    return items


def _cloudflare_generate(prompt: str, n: int, size: str) -> list[dict]:
    if not CLOUDFLARE_API_TOKEN or not CLOUDFLARE_ACCOUNT_ID:
        raise RuntimeError(
            "CLOUD_BACKEND=cloudflare but CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set"
        )
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/"
        f"{CLOUDFLARE_ACCOUNT_ID}/ai/run/{CLOUDFLARE_MODEL}"
    )
    w, h = _parse_size(size)
    payload: dict = {"prompt": prompt}
    if w and h:
        payload["width"] = w
        payload["height"] = h
    headers = {
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    items: list[dict] = []
    for _ in range(n):
        data = _http_post_json(url, payload, headers, GEN_TIMEOUT)
        result = data.get("result") or {}
        image_b64 = result.get("image")
        if not image_b64:
            raise RuntimeError(f"cloudflare result missing image: {str(data)[:300]}")
        raw = base64.b64decode(image_b64)
        items.append({"b64_json": image_b64, "mime": _sniff_mime(raw)})
    return items


def cloud_generate(prompt: str, n: int, size: str) -> list[dict]:
    if CLOUD_BACKEND == "nvidiabuild":
        return _nim_generate(prompt, n, size)
    if CLOUD_BACKEND == "fireworks":
        return _fireworks_generate(prompt, n, size)
    if CLOUD_BACKEND == "cloudflare":
        return _cloudflare_generate(prompt, n, size)
    return _openai_compat_generate(prompt, n, size)


def save_locally(items: list[dict]) -> list[str]:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    saved: list[str] = []
    for i, item in enumerate(items):
        raw = base64.b64decode(item["b64_json"])
        mime = item.get("mime") or _sniff_mime(raw)
        ext = ".jpg" if mime == "image/jpeg" else ".png" if mime == "image/png" else ".bin"
        path = os.path.join(OUTPUT_DIR, f"{stamp}_{i + 1}{ext}")
        with open(path, "wb") as fh:
            fh.write(raw)
        saved.append(path)
    return saved


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "SDCPPBridge/1.0"

    # ---- helpers ---------------------------------------------------------
    def _read_body(self) -> bytes | None:
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length > 0 else None

    def _reply(self, status: int, body: bytes, ctype: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, obj) -> None:
        self._reply(status, json.dumps(obj).encode("utf-8"), "application/json")

    def _cloud_image(self, body: bytes | None) -> None:
        try:
            req = json.loads(body or b"{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid JSON body"})
            return
        prompt = (req.get("prompt") or "").strip()
        if not prompt:
            self._json(400, {"error": "missing prompt"})
            return
        try:
            n = max(1, min(int(req.get("n") or 1), 8))
        except (TypeError, ValueError):
            n = 1
        size = str(req.get("size") or "512x512")
        try:
            items = cloud_generate(prompt, n, size)
            saved = save_locally(items)
        except Exception as exc:  # noqa: BLE001
            log(f"cloud image failed: {exc!r}")
            self._json(502, {"error": str(exc)})
            return
        for path in saved:
            log(f"saved {path}")
        self._json(200, {"data": items, "saved": saved})

    # ---- dispatch --------------------------------------------------------
    def _route(self, method: str) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if parsed.query:
            path = f"{path}?{parsed.query}"
        body = self._read_body()
        log(f"{method} {path}")

        if path in ("/", "/ui", "/index.html"):
            self._reply(200, UI_HTML.encode("utf-8"), "text/html; charset=utf-8")
            return

        if path in ("/mrs", "/chat", "/mrs/", "/chat/"):
            self._reply(200, CHAT_HTML.encode("utf-8"), "text/html; charset=utf-8")
            return

        # OpenAI-style streaming chat: relay Lemonade's SSE events as they arrive.
        if (
            method == "POST"
            and path.endswith("chat/completions")
            and body
        ):
            try:
                wants_stream = bool(json.loads(body).get("stream"))
            except Exception:
                wants_stream = False
            if wants_stream:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "close")
                self.end_headers()
                try:
                    forward_stream(method, path, body, LEM_PORT, self.wfile)
                except Exception as exc:  # noqa: BLE001
                    log(f"lemonade stream relay failed: {exc!r}")
                return

        if path in ("/health", "/api/v1/health"):
            sd = sd_healthy()
            if not sd:
                ensure_sd_async()
            lemon = lemonade_healthy()
            whisper = whisper_healthy()
            self._json(
                200 if sd else 503,
                {
                    "status": "ok" if sd else "degraded",
                    "sd_cpp": {"healthy": sd, "port": SD_PORT},
                    "lemonade": {"healthy": lemon, "port": LEM_PORT},
                    "whisper": {"healthy": whisper, "port": WHISPER_PORT},
                },
            )
            return

        # STT -> whisper.cpp whisper-server (built from source; lemonade's
        # bundled whispercpp is AVX2-compiled and crashes on the FX-8350).
        if path.startswith("/api/v1/audio/transcriptions"):
            target = "/inference" + path[len("/api/v1/audio/transcriptions"):]
            ctype = self.headers.get("Content-Type")
            try:
                status, resp_ctype, payload = forward(method, target, body, WHISPER_PORT, GEN_TIMEOUT, ctype)
            except Exception as exc:  # noqa: BLE001
                log(f"whisper-server forward failed: {exc!r}")
                self._json(502, {"error": f"whisper-server unreachable: {exc!r}"})
                return
            self._reply(status, payload, resp_ctype or "application/json")
            return

        if path.startswith(("/api/v1/images/", "/v1/images/", "/v1/models", "/sdapi/v1/")):
            if CLOUD_BACKEND and method == "POST" and ("images/generations" in path or "txt2img" in path):
                self._cloud_image(body)
                return
            target = path[4:] if path.startswith("/api/") else path
            # Governed S-ISA dispatch: image generation runs as a governed
            # session (instruction trace + invariant checks + replay), so a
            # latent sd-server crash becomes a governed error, never a dead
            # bridge. Non-generation routes (e.g. /v1/models, image edits)
            # pass through the plain crash-safe forward.
            if method == "POST" and ("images/generations" in target or "txt2img" in target):
                try:
                    status, ctype, payload = governed_image.run(method, target, body)
                except Exception as exc:  # noqa: BLE001
                    log(f"governed_image.run failed: {exc!r}")
                    self._json(500, {"error": f"governed image layer failed: {exc!r}"})
                    return
                self._reply(status, payload, ctype or "application/json")
                return
            try:
                status, ctype, payload = forward(method, target, body, SD_PORT, IMG_TIMEOUT)
            except Exception as exc:  # noqa: BLE001
                log(f"sd-server forward failed: {exc!r}")
                if not ensure_sd():
                    self._json(503, {"error": f"sd-server unreachable: {exc!r}"})
                    return
                try:
                    status, ctype, payload = forward(method, target, body, SD_PORT, IMG_TIMEOUT)
                except Exception as exc2:  # noqa: BLE001
                    log(f"sd-server retry failed: {exc2!r}")
                    self._json(502, {"error": f"sd-server unreachable after restart: {exc2!r}"})
                    return
            self._reply(status, payload, ctype or "application/json")
            return

        # Everything else: Lemonade passthrough (chat, audio/speech, STT, ...).
        try:
            status, ctype, payload = forward(method, path, body, LEM_PORT, GEN_TIMEOUT)
        except Exception as exc:  # noqa: BLE001
            log(f"lemonade forward failed: {exc!r}")
            self._json(502, {"error": f"lemonade unreachable: {exc!r}"})
            return
        if status == 404:
            # Maybe the caller expected an sd-server route we didn't match.
            try:
                status, ctype, payload = forward(method, path, body, SD_PORT, IMG_TIMEOUT)
            except Exception:
                pass
        self._reply(status, payload, ctype or "application/json")

    def do_GET(self) -> None:
        self._route("GET")

    def do_POST(self) -> None:
        self._route("POST")

    def do_PUT(self) -> None:
        self._route("PUT")

    def do_DELETE(self) -> None:
        self._route("DELETE")

    def log_message(self, fmt, *args) -> None:  # silence default stderr noise
        pass


def main() -> None:
    governed_image.configure(
        forward=forward,
        ensure_sd=ensure_sd,
        sd_port=SD_PORT,
        timeout=IMG_TIMEOUT,
        trace_dir=SD_LOGS,
    )
    server = ThreadingHTTPServer((BRIDGE_HOST, BRIDGE_PORT), BridgeHandler)
    log(f"bridge listening on {BRIDGE_HOST}:{BRIDGE_PORT} -> sd-server:{SD_PORT} / whisper:{WHISPER_PORT} / lemonade:{LEM_PORT}")
    log(f"governed S-ISA image layer active (trace -> {governed_image.trace_path()})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
