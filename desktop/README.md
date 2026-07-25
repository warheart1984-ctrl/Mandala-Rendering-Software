# 4DRS Copilot (desktop)

Operator shell for MRS / 4DRS: chat against local or cloud LLMs, run allowlisted doc/health tools, and probe localhost services.

## Capability table (Drive-G-1)

| Capability | Status | Evidence |
|---|---|---|
| React UI (chat / settings / viewport panel) | **real** | `src/App.tsx`, components |
| LLM routing (Ollama, OpenAI, Anthropic, Google) | **real** (Tauri) | `src-tauri/src/llm.rs` |
| OS keyring API key storage | **real** (Tauri) | `src-tauri/src/keys.rs` via `keyring` crate |
| Copilot tools (5) | **real** (Tauri FS/HTTP) | `src-tauri/src/tools.rs` |
| Browser-only Vite preview | **partial** | Ollama + HTTP probes; cloud keys/session fallback; no FS tools |
| Full RT4D / `@mrs/renderer-core` viewport | **not in this app** | Decorative lattice only (`LatticeCanvas`) — use `mrs/apps/chatgpt-mrs` for Canvas2D scenes |
| Streaming token UI | **not implemented** | Non-streaming chat completions |
| Production installer icons | **placeholder** | `scripts/write-icons.mjs` writes 1×1 PNGs |

## Prerequisites

1. **Node.js 20+** and npm  
2. **Rust** via [rustup](https://rustup.rs/) (`cargo` on `PATH`) — **required for `tauri:dev` / `tauri:build`**  
3. Tauri platform deps:  
   - Windows: WebView2 + MSVC Build Tools  
   - macOS: Xcode CLT  
   - Linux: webkit2gtk / related packages per [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)  
4. Optional: [Ollama](https://ollama.com/) for local models  
5. Optional local services for probes: Genblaze `:8787`, MRS ChatGPT app `:8000`

This machine may have Node without Rust — UI can still be developed with `npm run dev`.

## Run (dev)

```bash
cd desktop
npm install
node scripts/write-icons.mjs
npm run tauri:dev
```

UI-only (no Rust / no keyring / limited tools):

```bash
cd desktop
npm install
npm run dev
# open http://localhost:1420
```

## Build installers

Windows:

```bat
build.bat
```

macOS / Linux:

```bash
chmod +x build.sh
./build.sh
```

Or: `npm run tauri:build`

Outputs (when Rust toolchain is present): under `src-tauri/target/release/bundle/` (`.msi` / `.deb` / `.AppImage` / `.dmg` depending on host).

## Settings

- Provider picker: Ollama / OpenAI / Anthropic / Google  
- Ollama base URL (default `http://127.0.0.1:11434`)  
- Model name + temperature  
- Paste API keys → stored in **OS keyring** in Tauri (not in git)  
- Test connection button  
- Health URLs for Genblaze and MRS ChatGPT probes  

## Tools

| Tool | Action |
|---|---|
| `check_genblaze_health` | `GET` Genblaze `/health` |
| `check_mrs_chatgpt_health` | `GET` MRS ChatGPT `/health` |
| `list_invariant_docs` | List allowlisted invariant/constitution docs |
| `read_repo_doc` | Read allowlisted repo doc (size-capped) |
| `probe_ollama` | `GET` Ollama `/api/tags` |

Natural-language shortcuts in chat (e.g. “Is Genblaze healthy?”) map to these tools in the UI.

## Tests

```bash
npm run typecheck
npm run test
```

Rust unit tests (requires cargo):

```bash
cd src-tauri
cargo test
```

## Honest limitations

- Viewport is a **placeholder lattice + health probes**, not a governed MRS scene host and **not** full RT4D / `@mrs/renderer-core`.  
- Chat is **non-streaming**.  
- Doc tools need the Tauri process (repo path allowlist).  
- Genblaze health probe only checks `/health` — video backends (Cosmos / Seedance) remain **opt-in** on that service (`GENBLAZE_VIDEO_ENABLED=0` by default).  
- Do not commit API keys or `.env` files with secrets.
