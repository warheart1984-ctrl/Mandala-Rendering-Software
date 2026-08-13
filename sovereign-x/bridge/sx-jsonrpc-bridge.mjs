/**
 * Sovereign X JSON-RPC Bridge Server (Hardened)
 *
 * Persistent Node.js process that communicates via stdin/stdout JSON-RPC 2.0.
 * Eliminates subprocess spawn overhead and temp file I/O.
 *
 * Protocol v1.0.0 — see BRIDGE_PROTOCOL.md
 *
 * Methods:
 *   - bridge.hello: Protocol handshake (version, capabilities)
 *   - bridge.status: Runtime introspection (uptime, requests served)
 *   - bridge.shutdown: Graceful shutdown
 *   - ping: Liveness check
 *   - probe: Full capability probe
 *   - generate: Image generation via cascade
 *   - generate-direct: Direct Lemonade generation
 *   - list-models: List downloaded image models
 *   - health: Quick health check
 *   - verify-weights: Provenance gate
 *   - classify-halt: Halt cause classification
 *   - opencl.gen-still: CL-Gen scene-aware still via opencl_cl_gen_still.py
 *   - opencl.tonga-still: OpenCL Tonga legacy still proof
 *   - axiom-x.gen-still: Axiom-X production still via run_production.py
 *   - uals.init: Initialize UALS backend session
 *   - uals.execute: Execute kernel via UALS backend
 *   - uals.readback: Readback tile output
 *   - uals.teardown: Teardown UALS backend session
 *
 * Events (stderr, structured JSON):
 *   {"event":"ready","ts":123,"protocol":"1.0.0"}
 *   {"event":"shutdown","ts":123,"reason":"client_request"}
 *   {"event":"error","ts":123,"message":"..."}
 */

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stdin, stdout, stderr } from "node:process";
import { createHash } from "node:crypto";
import { spawnPythonScript, CL_GEN_SCRIPT, OPENCL_TONGA_SCRIPT, AXIOM_X_RUNNER, CL_GEN_DEFAULT_SCENE, repoRoot } from "./pythonSpawn.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireJson = createRequire(import.meta.url);

const BRIDGE_PROTOCOL_VERSION = "1.0.0";
const BRIDGE_SERVER_NAME = "sx-jsonrpc-bridge";

const sxRoot = resolve(__dirname, "..");
const lemonadeSdAdapterPath = join(sxRoot, "router", "modules", "gpu", "amd", "lemonadeSdAdapter.js");

let lemonadeSdAdapter = null;
let adapterLoadError = null;
let bridgeStartTime = Date.now();
let requestsServed = 0;
let shuttingDown = false;

// UALS session state
const ualsSessions = new Map();

async function loadAdapter() {
  if (lemonadeSdAdapter) return lemonadeSdAdapter;
  if (adapterLoadError) throw adapterLoadError;
  try {
    const mod = await import(pathToFileURL(lemonadeSdAdapterPath).href);
    lemonadeSdAdapter = mod;
    return mod;
  } catch (e) {
    adapterLoadError = e;
    throw e;
  }
}

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
const SERVER_BUSY = -32000;
const SERVER_SHUTTING_DOWN = -32001;

function sendResponse(response) {
  if (shuttingDown && response.result && !response.error) return;
  stdout.write(JSON.stringify(response) + "\n");
}

function sendEvent(eventObj) {
  stderr.write(JSON.stringify({ ...eventObj, ts: Date.now() }) + "\n");
}

/**
 * Create a provenance record for the operation.
 */
function createProvenanceRecord(method, params, result, startTime) {
  return {
    method,
    timestamp: new Date().toISOString(),
    startTime,
    endTime: Date.now(),
    durationMs: Date.now() - startTime,
    params: sanitizeParams(params),
    result: sanitizeResult(result),
    hash: null, // filled below
  };
}

function sanitizeParams(params) {
  if (!params) return {};
  const out = { ...params };
  // Remove sensitive/large fields
  delete out.sceneJson;
  delete out.pngBase64;
  return out;
}

function sanitizeResult(result) {
  if (!result) return {};
  const out = { ...result };
  delete out.pngBase64;
  delete out.stdoutTail;
  delete out.stderrTail;
  delete out.report;
  return out;
}

function hashProvenance(prov) {
  return createHash("sha256").update(JSON.stringify(prov)).digest("hex");
}

/**
 * Constitutional Knowledge Layer (CKL) policy evaluation.
 * Mirrors key policies from engine/governance/policies/default.policies.json
 */
function evaluateCKLPolicies(method, params, intent = null, evidence = null) {
  const violations = [];
  const requirements = [];
  let attachProvenance = false;
  let paramAdjust = null;
  let haltCode = null;

  // Policy: no execution without intent
  if (!intent && method !== "ping" && method !== "bridge.hello" && method !== "bridge.status") {
    // Allow bridge internal methods, but require intent for actual operations
    const requiresIntent = [
      "generate", "generate-direct", "probe", "health",
      "opencl.gen-still", "opencl.tonga-still", "axiom-x.gen-still",
      "uals.init", "uals.execute", "uals.readback", "uals.teardown",
    ];
    if (requiresIntent.includes(method)) {
      violations.push("policy-no-execution-without-intent");
      haltCode = "NO_INTENT";
    }
  }

  // Policy: require evidence for mutation
  const mutationMethods = [
    "generate", "generate-direct", "opencl.gen-still", "opencl.tonga-still", "axiom-x.gen-still",
    "uals.execute", "uals.init",
  ];
  if (mutationMethods.includes(method)) {
    if (!evidence && !params?.evidence) {
      violations.push("policy-no-state-change-without-evidence");
      haltCode = haltCode || "NO_EVIDENCE";
    }
  }

  // Policy: no render without provenance
  const renderMethods = [
    "generate", "generate-direct", "opencl.gen-still", "opencl.tonga-still", "axiom-x.gen-still",
    "uals.execute",
  ];
  if (renderMethods.includes(method)) {
    attachProvenance = true;
    requirements.push("provenance");
  }

  // Policy: no authority without contract
  if (intent && intent.actor) {
    const action = intent.action || intent.authorizedAction || method;
    // In bridge context, we check if actor has a registered contract
    // For now, allow known actors
    const allowedActors = [
      "4dce.director", "4dce.replay", "4dce.render",
      "uals.orchestrator", "fmce.sx", "sovereign-x.router",
    ];
    if (!allowedActors.includes(intent.actor)) {
      violations.push("policy-no-authority-without-contract");
      haltCode = haltCode || "NO_CONTRACT";
    }
  }

  // Policy: play_timeline requires world
  if (method === "play_timeline" || params?.kind === "play_timeline") {
    const world = params?.world || params?.worldId || params?.constraints?.worldId;
    if (!world) {
      violations.push("policy-play-timeline-requires-world");
      haltCode = "NO_WORLD";
    }
  }

  // Policy: ascension drift throttle (for high-compute methods)
  const highComputeMethods = [
    "generate", "opencl.gen-still", "axiom-x.gen-still", "uals.execute",
  ];
  if (highComputeMethods.includes(method)) {
    const driftScore = params?.driftScore || evidence?.driftScore || 0;
    if (driftScore > 0.7) {
      paramAdjust = { throttleFactor: 0.5, reason: "drift_throttle" };
    }
  }

  // Policy: ascension evidence dual-require
  if (method === "mythar.ascend" || params?.ascension) {
    if (!evidence?.ascensionProof || !evidence?.constitutionalProof) {
      violations.push("policy-ascension-evidence");
      haltCode = "ASCENSION_EVIDENCE_MISSING";
    }
  }

  return {
    ok: violations.length === 0,
    verdict: violations.length === 0 ? "allow" : "deny",
    violations,
    requirements,
    attachProvenance,
    paramAdjust,
    haltCode,
  };
}

/**
 * Wrap result with provenance and CKL decision.
 */
function wrapWithGovernance(method, params, result, startTime, intent = null, evidence = null) {
  const cklDecision = evaluateCKLPolicies(method, params, intent, evidence);
  const provenance = createProvenanceRecord(method, params, result, startTime);
  provenance.hash = hashProvenance(provenance);

  return {
    ...result,
    cklDecision,
    provenance,
    governance: {
      bridge: BRIDGE_SERVER_NAME,
      protocol: BRIDGE_PROTOCOL_VERSION,
      timestamp: new Date().toISOString(),
    },
  };
}

const handlers = {
  async "bridge.hello"(params) {
    const startTime = Date.now();
    const clientVersion = params?.protocol || "unknown";
    const result = {
      server: BRIDGE_SERVER_NAME,
      protocol: BRIDGE_PROTOCOL_VERSION,
      clientProtocol: clientVersion,
      compatible: clientVersion === BRIDGE_PROTOCOL_VERSION,
      methods: Object.keys(handlers),
      startTime: bridgeStartTime,
    };
    return wrapWithGovernance("bridge.hello", params, result, startTime, params?.intent, params?.evidence);
  },

  async "bridge.status"() {
    const startTime = Date.now();
    const result = {
      server: BRIDGE_SERVER_NAME,
      protocol: BRIDGE_PROTOCOL_VERSION,
      uptimeMs: Date.now() - bridgeStartTime,
      requestsServed,
      shuttingDown,
      adapterLoaded: lemonadeSdAdapter !== null,
      pid: process.pid,
    };
    return wrapWithGovernance("bridge.status", {}, result, startTime);
  },

  async "bridge.shutdown"(params) {
    const startTime = Date.now();
    shuttingDown = true;
    const reason = params?.reason || "client_request";
    sendEvent({ event: "shutdown", reason });
    const result = { ok: true, reason, shutdownAt: Date.now() };
    sendResponse({
      jsonrpc: "2.0",
      id: null,
      result: wrapWithGovernance("bridge.shutdown", params, result, startTime),
    });
    setTimeout(() => process.exit(0), 100);
    return null;
  },

  async ping() {
    const startTime = Date.now();
    const result = { pong: true, ts: Date.now() };
    return wrapWithGovernance("ping", {}, result, startTime);
  },

  async probe(params) {
    const startTime = Date.now();
    const adapter = await loadAdapter();
    const result = await adapter.reportLemonadeSdCapability(params || {});
    return wrapWithGovernance("probe", params, result, startTime, params?.intent, params?.evidence);
  },

  async generate(params) {
    const startTime = Date.now();
    const adapter = await loadAdapter();
    const result = await adapter.generateStillViaImageGenProviders(params || {});
    return wrapWithGovernance("generate", params, result, startTime, params?.intent, params?.evidence);
  },

  async "generate-direct"(params) {
    const startTime = Date.now();
    const adapter = await loadAdapter();
    const result = await adapter.generateStillViaLemonade(params || {});
    return wrapWithGovernance("generate-direct", params, result, startTime, params?.intent, params?.evidence);
  },

  async "list-models"(params) {
    const startTime = Date.now();
    const adapter = await loadAdapter();
    const probe = await adapter.probeLemonadeCapabilities({ verifyWeights: false, ...params });
    const result = {
      models: probe.downloadedImageModels || [],
      allModels: probe.imageModels || [],
      serverUp: probe.serverUp,
    };
    return wrapWithGovernance("list-models", params, result, startTime, params?.intent, params?.evidence);
  },

  async health(params) {
    const startTime = Date.now();
    const adapter = await loadAdapter();
    const probe = await adapter.probeLemonadeCapabilities({ verifyWeights: false, timeoutMs: 5000 });
    const result = {
      serverUp: probe.serverUp,
      status: probe.status,
      baseUrl: probe.baseUrl,
      health: probe.health,
      blockers: (probe.blockers || []).slice(0, 3),
    };
    return wrapWithGovernance("health", params, result, startTime, params?.intent, params?.evidence);
  },

  async "verify-weights"(params) {
    const startTime = Date.now();
    const adapter = await loadAdapter();
    const result = await adapter.verifyModelWeightsProvenance(params || {});
    return wrapWithGovernance("verify-weights", params, result, startTime, params?.intent, params?.evidence);
  },

  async "classify-halt"(params) {
    const startTime = Date.now();
    const adapter = await loadAdapter();
    const result = await adapter.classifyLemonadeHaltCause(params || {});
    return wrapWithGovernance("classify-halt", params, result, startTime, params?.intent, params?.evidence);
  },

  // ===== OpenCL / Axiom-X methods (migrated from subprocess patterns) =====

  async "opencl.gen-still"(params) {
    const startTime = Date.now();
    const outPath = resolve(params.outPath || join(repoRoot, "docs", "4d-engine", "proofs", "cl-gen", "opencl-gen-dim-room.png"));
    const reportPath = resolve(params.reportPath || join(dirname(outPath), "opencl-gen-dim-room.json"));
    const width = params.width ?? 512;
    const height = params.height ?? 512;
    const seed = params.seed ?? 1.0;
    const timeoutMs = params.timeoutMs ?? 180_000;

    const args = [
      "--out", outPath,
      "--report", reportPath,
      "--width", String(width),
      "--height", String(height),
      "--seed", String(seed),
    ];
    if (params.sceneJson) {
      args.push("--scene-json", JSON.stringify(params.sceneJson));
    } else if (existsSync(CL_GEN_DEFAULT_SCENE)) {
      args.push("--scene", CL_GEN_DEFAULT_SCENE);
    }

    const result = await spawnPythonScript(CL_GEN_SCRIPT, args, { timeoutMs, outPath, reportPath });
    return wrapWithGovernance("opencl.gen-still", params, result, startTime, params?.intent, params?.evidence);
  },

  async "opencl.tonga-still"(params) {
    const startTime = Date.now();
    const outPath = resolve(params.outPath || join(repoRoot, "docs", "4d-engine", "proofs", "legacy-efficient", "opencl-tonga-still.png"));
    const reportPath = resolve(params.reportPath || join(repoRoot, "docs", "4d-engine", "proofs", "legacy-efficient", "opencl-tonga-probe.json"));
    const width = params.width ?? 256;
    const height = params.height ?? 256;
    const seed = params.seed ?? 1.0;
    const timeoutMs = params.timeoutMs ?? 120_000;

    const args = [
      "--out", outPath,
      "--report", reportPath,
      "--width", String(width),
      "--height", String(height),
      "--seed", String(seed),
    ];

    const result = await spawnPythonScript(OPENCL_TONGA_SCRIPT, args, { timeoutMs, outPath, reportPath });
    return wrapWithGovernance("opencl.tonga-still", params, result, startTime, params?.intent, params?.evidence);
  },

  async "axiom-x.gen-still"(params) {
    const startTime = Date.now();
    const outDir = resolve(params.outDir || join(repoRoot, "tmp", "axiom-x-still"));
    const reportPath = resolve(params.reportPath || join(outDir, "evidence.json"));
    const width = params.width ?? 256;
    const height = params.height ?? 256;
    const seed = params.seed ?? 1.0;
    const timeoutMs = params.timeoutMs ?? 120_000;

    const args = [
      "--mode", "still",
      "--out-dir", outDir,
      "--width", String(width),
      "--height", String(height),
      "--seed", String(seed),
    ];
    if (params.intentId) args.push("--intent-id", String(params.intentId));
    if (params.worldId) args.push("--world-id", String(params.worldId));
    if (params.timelineId) args.push("--timeline-id", String(params.timelineId));

    const result = await spawnPythonScript(AXIOM_X_RUNNER, args, { timeoutMs, outPath: join(outDir, "bridge", "output.png"), reportPath });
    return wrapWithGovernance("axiom-x.gen-still", params, result, startTime, params?.intent, params?.evidence);
  },

  // ===== UALS Bridge Backend Methods =====

  async "uals.init"(params) {
    const startTime = Date.now();
    const { sessionId, backendId, backendType, maxTileSize, supportedKernels, determinismLevel, context } = params;

    if (!sessionId || !backendId) {
      return wrapWithGovernance("uals.init", params, {
        ok: false,
        code: "INVALID_PARAMS",
        message: "sessionId and backendId required",
      }, startTime, params?.intent, params?.evidence);
    }

    const session = {
      sessionId,
      backendId,
      backendType,
      maxTileSize,
      supportedKernels: new Set(supportedKernels || []),
      determinismLevel,
      context: context || {},
      createdAt: Date.now(),
    };
    ualsSessions.set(sessionId, session);

    const result = {
      ok: true,
      sessionId,
      backendId,
      backendType,
      maxTileSize,
      supportedKernels: Array.from(session.supportedKernels),
      determinismLevel,
      context: session.context,
      message: `UALS backend ${backendId} initialized`,
    };
    return wrapWithGovernance("uals.init", params, result, startTime, params?.intent, params?.evidence);
  },

  async "uals.execute"(params) {
    const startTime = Date.now();
    const { sessionId, kernelId, params: kernelParams, tile } = params;

    if (!sessionId) {
      return wrapWithGovernance("uals.execute", params, {
        ok: false,
        code: "INVALID_PARAMS",
        message: "sessionId required",
      }, startTime, params?.intent, params?.evidence);
    }

    const session = ualsSessions.get(sessionId);
    if (!session) {
      return wrapWithGovernance("uals.execute", params, {
        ok: false,
        code: "SESSION_NOT_FOUND",
        message: `Session ${sessionId} not found`,
      }, startTime, params?.intent, params?.evidence);
    }

    if (!session.supportedKernels.has(kernelId)) {
      return wrapWithGovernance("uals.execute", params, {
        ok: false,
        code: "KERNEL_INCOMPATIBLE",
        message: `Kernel ${kernelId} not supported by backend ${session.backendId}`,
      }, startTime, params?.intent, params?.evidence);
    }

    // Determine which script to call based on backend type
    let scriptPath;
    let scriptArgs = [];
    let outPath;
    let reportPath;
    const timeoutMs = params.timeoutMs ?? session.maxTileSize.width > 512 ? 300_000 : 120_000;

    switch (session.backendType) {
case "opencl":
        scriptPath = OPENCL_TONGA_SCRIPT;
        outPath = resolve(params.outPath || join(repoRoot, "tmp", `uals-${sessionId}-${tile?.tileId || "tile"}.png`));
        reportPath = resolve(params.reportPath || join(dirname(outPath), `uals-${sessionId}-report.json`));
        scriptArgs = [
          "--out", outPath,
          "--report", reportPath,
          "--width", String(tile?.width || kernelParams?.width || 256),
          "--height", String(tile?.height || kernelParams?.height || 256),
          "--seed", String(kernelParams?.seed || 1.0),
        ];
        break;
case "cl-gen":
        scriptPath = CL_GEN_SCRIPT;
        outPath = resolve(params.outPath || join(repoRoot, "tmp", `uals-clgen-${sessionId}-${tile?.tileId || "tile"}.png`));
        reportPath = resolve(params.reportPath || join(dirname(outPath), `uals-clgen-${sessionId}-report.json`));
        scriptArgs = [
          "--out", outPath,
          "--report", reportPath,
          "--width", String(tile?.width || kernelParams?.width || 512),
          "--height", String(tile?.height || kernelParams?.height || 512),
          "--seed", String(kernelParams?.seed || 1.0),
        ];
        if (kernelParams?.sceneJson) {
          scriptArgs.push("--scene-json", JSON.stringify(kernelParams.sceneJson));
        }
        break;
      case "axiom-x":
        scriptPath = AXIOM_X_RUNNER;
        const outDir = resolve(params.outDir || join(repoRoot, "tmp", `uals-axiomx-${sessionId}`));
        outPath = join(outDir, "bridge", "output.png");
        reportPath = resolve(params.reportPath || join(outDir, "evidence.json"));
        scriptArgs = [
          "--mode", "still",
          "--out-dir", outDir,
          "--width", String(tile?.width || kernelParams?.width || 256),
          "--height", String(tile?.height || kernelParams?.height || 256),
          "--seed", String(kernelParams?.seed || 1.0),
        ];
        if (params.intentId) scriptArgs.push("--intent-id", String(params.intentId));
        if (params.worldId) scriptArgs.push("--world-id", String(params.worldId));
        if (params.timelineId) scriptArgs.push("--timeline-id", String(params.timelineId));
        break;
      default:
        return wrapWithGovernance("uals.execute", params, {
          ok: false,
          code: "UNSUPPORTED_BACKEND",
          message: `Backend type ${session.backendType} not supported`,
        }, startTime, params?.intent, params?.evidence);
    }

    const result = await spawnPythonScript(scriptPath, scriptArgs, { timeoutMs, outPath, reportPath });

    // Add UALS-specific metadata
    result.kernelId = kernelId;
    result.tileId = tile?.tileId;
    result.sessionId = sessionId;
    result.backendId = session.backendId;

    return wrapWithGovernance("uals.execute", params, result, startTime, params?.intent, params?.evidence);
  },

  async "uals.readback"(params) {
    const startTime = Date.now();
    const { sessionId, tileId } = params;

    if (!sessionId) {
      return wrapWithGovernance("uals.readback", params, {
        ok: false,
        code: "INVALID_PARAMS",
        message: "sessionId required",
      }, startTime, params?.intent, params?.evidence);
    }

    const session = ualsSessions.get(sessionId);
    if (!session) {
      return wrapWithGovernance("uals.readback", params, {
        ok: false,
        code: "SESSION_NOT_FOUND",
        message: `Session ${sessionId} not found`,
      }, startTime, params?.intent, params?.evidence);
    }

    // Readback handled in execute for this implementation
    const result = {
      ok: true,
      message: "Readback handled in uals.execute",
      tileId,
      sessionId,
    };
    return wrapWithGovernance("uals.readback", params, result, startTime, params?.intent, params?.evidence);
  },

  async "uals.teardown"(params) {
    const startTime = Date.now();
    const { sessionId } = params;

    if (!sessionId) {
      return wrapWithGovernance("uals.teardown", params, {
        ok: false,
        code: "INVALID_PARAMS",
        message: "sessionId required",
      }, startTime, params?.intent, params?.evidence);
    }

    const session = ualsSessions.get(sessionId);
    if (!session) {
      return wrapWithGovernance("uals.teardown", params, {
        ok: false,
        code: "SESSION_NOT_FOUND",
        message: `Session ${sessionId} not found`,
      }, startTime, params?.intent, params?.evidence);
    }

    ualsSessions.delete(sessionId);

    const result = {
      ok: true,
      message: `UALS session ${sessionId} torn down`,
      sessionId,
    };
    return wrapWithGovernance("uals.teardown", params, result, startTime, params?.intent, params?.evidence);
  },
};

async function processRequest(line) {
  let request;

  try {
    request = JSON.parse(line);
  } catch (e) {
    sendResponse({
      jsonrpc: "2.0",
      id: null,
      error: { code: PARSE_ERROR, message: "Parse error" },
    });
    return;
  }

  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    sendResponse({
      jsonrpc: "2.0",
      id: request.id || null,
      error: { code: INVALID_REQUEST, message: "Invalid Request" },
    });
    return;
  }

  if (shuttingDown && request.method !== "ping") {
    sendResponse({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: SERVER_SHUTTING_DOWN,
        message: "Bridge is shutting down",
        data: { method: request.method },
      },
    });
    return;
  }

  const handler = handlers[request.method];
  if (!handler) {
    sendResponse({
      jsonrpc: "2.0",
      id: request.id,
      error: { code: METHOD_NOT_FOUND, message: `Method not found: ${request.method}` },
    });
    return;
  }

  try {
    requestsServed++;
    const result = await handler(request.params);
    if (result !== null) {
      sendResponse({
        jsonrpc: "2.0",
        id: request.id,
        result,
      });
    }
  } catch (e) {
    requestsServed++;
    sendEvent({ event: "error", message: e.message, stack: e.stack });
    sendResponse({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: INTERNAL_ERROR,
        message: e instanceof Error ? e.message : String(e),
        data: e instanceof Error ? e.stack : undefined,
      },
    });
  }
}

let buffer = "";
stdin.setEncoding("utf8");
stdin.on("data", (chunk) => {
  buffer += chunk;
  let lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) processRequest(trimmed);
  }
});

stdin.on("end", () => {
  if (buffer.trim()) processRequest(buffer.trim());
  sendEvent({ event: "shutdown", reason: "stdin_closed" });
  process.exit(0);
});

process.on("uncaughtException", (e) => {
  sendEvent({ event: "error", message: `Uncaught: ${e.message}`, stack: e.stack });
  process.exit(1);
});

process.on("unhandledRejection", (e) => {
  sendEvent({ event: "error", message: `Unhandled rejection: ${e}` });
});

process.on("SIGTERM", () => {
  sendEvent({ event: "shutdown", reason: "sigterm" });
  process.exit(0);
});

process.on("SIGINT", () => {
  sendEvent({ event: "shutdown", reason: "sigint" });
  process.exit(0);
});

sendEvent({
  event: "ready",
  protocol: BRIDGE_PROTOCOL_VERSION,
  server: BRIDGE_SERVER_NAME,
  pid: process.pid,
  adapter: lemonadeSdAdapterPath,
});

export { handlers, loadAdapter, BRIDGE_PROTOCOL_VERSION, evaluateCKLPolicies, createProvenanceRecord };