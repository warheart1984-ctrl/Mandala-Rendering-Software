import { TesseractRenderer } from "./renderer.js";
import {
  capturePicture,
  recordMovie,
  downloadProvenance,
  downloadBlob,
} from "./export.js";
import { bootEngine } from "./engine/boot.js";
import { SharedFramePreview } from "../mrs/packages/renderer-core/src/gpu/SharedFramePreview.js";

const canvas = document.getElementById("stage");
const statusEl = document.getElementById("export-status");
const btnPicture = document.getElementById("btn-picture");
const btnMovie = document.getElementById("btn-movie");
const btnProvenance = document.getElementById("btn-provenance");
const btnReplay = document.getElementById("btn-replay");
const btnPlay = document.getElementById("btn-play-timeline");
const btnAscension = document.getElementById("btn-play-ascension");
const btnPause = document.getElementById("btn-pause-timeline");
const durationEl = document.getElementById("ctrl-duration");
const surfaceEl = document.getElementById("ctrl-surface");
const modeEl = document.getElementById("ctrl-mode");
const profileEl = document.getElementById("ctrl-profile");
const qualityEl = document.getElementById("ctrl-quality");
const btnToggleRender = document.getElementById("btn-toggle-render");
const btnResetView = document.getElementById("btn-reset-view");
const csrLogEl = document.getElementById("csr-log");
const charterBadge = document.getElementById("charter-badge");
const worldBadge = document.getElementById("world-badge");
const timelineReadout = document.getElementById("read-timeline");

const readouts = {
  theta: document.getElementById("read-theta"),
  verts: document.getElementById("read-verts"),
  edges: document.getElementById("read-edges"),
  d4: document.getElementById("read-d4"),
  d3: document.getElementById("read-d3"),
  fps: document.getElementById("read-fps"),
};

let engine = null;

const renderer = new TesseractRenderer(canvas, {
  profile: "technical",
  quality: "high",
  onFrame({ theta, vertexCount, edgeCount, d4, d3, dt, speed, fps, quality }) {
    readouts.theta.textContent = theta.toFixed(2);
    readouts.verts.textContent = String(vertexCount);
    readouts.edges.textContent = String(edgeCount);
    readouts.d4.textContent = d4.toFixed(1);
    readouts.d3.textContent = d3.toFixed(1);
    readouts.fps.textContent = `${Math.round(fps)} · ${quality}`;

    if (engine?.timelinePlayer) {
      const tp = engine.timelinePlayer;
      if (tp.playing) {
        tp.tick(dt, renderer);
        syncSlidersFromRenderer();
      }
      timelineReadout.textContent = `${tp.timeSec.toFixed(2)}s / ${tp.durationSec}s${tp.playing ? " ▶" : ""}`;
    }

    if (engine?.provenance && engine.timelinePlayer?.playing) {
      const frame = {
        intentId: engine._activeIntentId ?? null,
        timelineId: engine.timelinePlayer.timeline?.id ?? null,
        worldId: engine.world?.id ?? null,
        timeSeconds: engine.timelinePlayer.timeSec,
        parameters: {
          speed: renderer.speed,
          d4: renderer.d4,
          d3: renderer.d3,
          cameraY: renderer.cameraY,
        },
      };
      engine.provenance.record(frame);
      engine.cssv?.registerFrame(frame);
    }
  },
});

function setStatus(msg) {
  statusEl.textContent = msg;
}

function setBusy(busy) {
  for (const el of [
    btnPicture,
    btnMovie,
    durationEl,
    surfaceEl,
    modeEl,
    btnProvenance,
    btnReplay,
    btnPlay,
    btnAscension,
    btnPause,
  ]) {
    if (el) el.disabled = busy;
  }
}

function bindSlider(id, apply) {
  const el = document.getElementById(id);
  const out = document.querySelector(`[data-for="${id}"]`);
  const sync = () => {
    apply(Number(el.value));
    if (out) out.textContent = el.value;
  };
  el.addEventListener("input", sync);
  sync();
  return {
    el,
    sync: () => {
      if (out) out.textContent = el.value;
    },
  };
}

const sliders = {
  speed: bindSlider("ctrl-speed", (v) => {
    renderer.speed = v;
  }),
  d4: bindSlider("ctrl-d4", (v) => {
    renderer.d4 = v;
  }),
  d3: bindSlider("ctrl-d3", (v) => {
    renderer.d3 = v;
  }),
  scale: bindSlider("ctrl-scale", (v) => {
    renderer.scale = v;
  }),
};

surfaceEl?.addEventListener("change", () => {
  renderer.setSurface(surfaceEl.value);
});
modeEl?.addEventListener("change", () => {
  renderer.renderMode = modeEl.value;
});
profileEl?.addEventListener("change", () => {
  renderer.setProfile(profileEl.value);
  modeEl.value = renderer.renderMode;
});
qualityEl?.addEventListener("change", () => renderer.setQuality(qualityEl.value));
btnToggleRender?.addEventListener("click", () => {
  renderer.toggle();
  btnToggleRender.textContent = renderer.running ? "Pause renderer" : "Resume renderer";
});
btnResetView?.addEventListener("click", () => {
  renderer.resetView();
  syncSlidersFromRenderer();
});
window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.code === "Space") { event.preventDefault(); btnToggleRender?.click(); }
  if (event.key.toLowerCase() === "r") btnResetView?.click();
});

function syncSlidersFromRenderer() {
  sliders.speed.el.value = String(Number(renderer.speed.toFixed(2)));
  sliders.d4.el.value = String(Number(renderer.d4.toFixed(1)));
  sliders.d3.el.value = String(Number(renderer.d3.toFixed(1)));
  sliders.scale.el.value = String(Math.round(renderer.scale));
  Object.values(sliders).forEach((s) => s.sync());
}

function refreshCsrLog() {
  const csrs = engine.cse.listCsrs();
  csrLogEl.replaceChildren();
  if (!csrs.length) {
    csrLogEl.textContent = "No CSR yet.";
    return;
  }
  for (const c of csrs.slice(-8).reverse()) {
    const row = document.createElement("div");
    row.className = "csr-row";
    const idEl = document.createElement("span");
    idEl.className = "csr-id";
    idEl.textContent = String(c.id ?? "");
    const actionEl = document.createElement("span");
    actionEl.textContent = String(c.action ?? "");
    const thetaEl = document.createElement("span");
    const t = c.evidence?.theta?.toFixed?.(2) ?? "—";
    thetaEl.textContent = `θ=${t}`;
    row.append(idEl, document.createTextNode(" "), actionEl, document.createTextNode(" "), thetaEl);
    csrLogEl.appendChild(row);
  }
}

async function governed({ kind, goal, action, actor, evidence, run }) {
  const intent = engine.cse.declareIntent({
    kind,
    goal,
    actor: actor ?? "4dce.renderer",
    constraints: { worldId: engine.world.id },
  });
  return engine.orchestrator.execute({ intent, evidence, action, run });
}

btnPicture.addEventListener("click", async () => {
  try {
    setBusy(true);
    setStatus("Governing picture export…");
    const { csr } = await governed({
      kind: "artifact.picture",
      goal: "Capture governed PNG still",
      action: "artifact.picture.export",
      evidence: engine.evidence.fromRenderer(renderer, { kind: "picture" }),
      run: () => capturePicture(canvas),
    });
    downloadProvenance(
      { csr, worldId: engine.world.id, timelineId: engine.timeline.id },
      "4dce-csr-picture",
    );
    setStatus(`CSR ${csr.id} · ${csr.result.filename}`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Picture failed");
  } finally {
    setBusy(false);
  }
});

btnMovie.addEventListener("click", async () => {
  const seconds = Number(durationEl.value) || 8;
  try {
    setBusy(true);
    setStatus(`Governing ${seconds}s movie…`);
    const { csr } = await governed({
      kind: "artifact.movie",
      goal: `Record governed ${seconds}s WebM`,
      action: "artifact.movie.export",
      evidence: engine.evidence.fromRenderer(renderer, {
        kind: "movie",
        seconds,
      }),
      run: () =>
        recordMovie(canvas, {
          seconds,
          fps: 30,
          onProgress(p) {
            setStatus(`Recording… ${Math.round(p * 100)}%`);
          },
        }),
    });
    downloadProvenance(
      { csr, worldId: engine.world.id, timelineId: engine.timeline.id },
      "4dce-csr-movie",
    );
    setStatus(`CSR ${csr.id} · ${csr.result.filename}`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Movie failed");
  } finally {
    setBusy(false);
  }
});

btnProvenance.addEventListener("click", async () => {
  try {
    const { csr } = await governed({
      kind: "artifact.provenance",
      goal: "Download CSSV session ledger",
      action: "artifact.provenance.download",
      actor: "4dce.export",
      evidence: {
        ...engine.evidence.fromRenderer(renderer),
        recordCount: engine.cse.records.length,
        frameCount: engine.cssv?.frames?.length ?? 0,
      },
      run: async () => {
        const cseExport = downloadProvenance(
          engine.cse.exportProvenance(),
          "4dce-cse-ledger",
        );
        const cssvPack = engine.cssv?.exportLedgerDownload("cssv-session");
        let cssvExport = null;
        if (cssvPack?.json) {
          const blob = new Blob([cssvPack.json], { type: "application/json" });
          downloadBlob(blob, cssvPack.filename);
          cssvExport = { filename: cssvPack.filename, bytes: cssvPack.bytes };
        }
        let sync = null;
        if (engine.cssvSyncUrl) {
          sync = await engine.cssv.syncToServer(engine.cssvSyncUrl);
        }
        return { cseExport, cssvExport, sync };
      },
    });
    const syncMsg = csr.result.sync?.ok
      ? " · synced to CSSV server"
      : csr.result.sync?.error
        ? ` · sync skipped (${csr.result.sync.error})`
        : "";
    setStatus(`CSSV ledger downloaded${syncMsg} · CSR ${csr.id}`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Ledger failed");
  }
});

btnReplay.addEventListener("click", async () => {
  try {
    const prior = engine.replay.latestExportCsr();
    if (!prior) {
      setStatus("No CSR to replay — export first.");
      return;
    }
    const { csr } = await governed({
      kind: "replay.params",
      goal: `Replay ${prior.id}`,
      action: "csr.replay.params",
      evidence: engine.evidence.fromRenderer(renderer, { replayOf: prior.id }),
      run: async () => {
        engine.replay.applyParams(renderer, prior.evidence);
        syncSlidersFromRenderer();
        return { replayedCsrId: prior.id };
      },
    });
    setStatus(`Replayed ${csr.result.replayedCsrId}`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Replay failed");
  }
});

btnPlay.addEventListener("click", async () => {
  try {
    engine.loadTimeline(engine.timeline);
    const contextJson = JSON.stringify({
      actor: "4dce.timeline",
      worldId: engine.world.id,
    });
    const intent = engine.isl.CompileAndEvaluate(
      engine.islOpeningScript,
      contextJson,
    );
    engine._activeIntentId = intent.id;
    const evidence = {
      ...engine.evidence.fromRenderer(renderer),
      id: intent.evidenceId ?? "ev-open-4d-001",
      timeSec: engine.timelinePlayer.timeSec,
      timelineId: engine.timeline.id,
      worldId: engine.world.id,
    };
    const decision = engine.gk.evaluateIntent(intent, evidence);
    if (!decision.ok) {
      throw new Error(
        `${decision.reason}: ${(decision.violations || []).join(", ")}`,
      );
    }
    engine.cssv?.registerTransition({
      intent,
      authority: "4dce.timeline",
      evidence,
      decision: { allowed: decision.ok, reasons: decision.violations ?? [] },
      timeSeconds: engine.timelinePlayer.timeSec,
    });
    if (decision.paramAdjust?.speed != null) {
      renderer.speed = Number(decision.paramAdjust.speed);
    }
    const { csr } = await governed({
      kind: "play_timeline",
      goal: `Play ${engine.timeline.name} via ISL`,
      action: "timeline.play",
      actor: "4dce.timeline",
      evidence,
      run: async () => {
        if (engine.timelinePlayer.timeSec >= engine.timelinePlayer.durationSec) {
          engine.timelinePlayer.reset();
        }
        engine.provenance?.clear();
        engine.timelinePlayer.play();
        return {
          timelineId: engine.timeline.id,
          intentId: intent.id,
          decisionId: decision.decisionId,
        };
      },
    });
    setStatus(`ISL+CKL allow · Timeline playing · CSR ${csr.id}`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Play failed");
  }
});

btnAscension?.addEventListener("click", async () => {
  try {
    engine.loadTimeline(engine.ascensionTimeline);
    const contextJson = JSON.stringify({
      actor: "4dce.timeline",
      worldId: engine.world.id,
    });
    const intent = engine.isl.CompileAndEvaluate(
      engine.islAscensionScript,
      contextJson,
    );
    engine._activeIntentId = intent.id;
    // Dual evidence required by policy-ascension-evidence
    const evidence = {
      ...engine.evidence.fromRenderer(renderer),
      id: "ev-ascension-001",
      evidenceIds: ["ev-ascension-001", "ev-ascension-002"],
      driftScore: 0.2,
      timeSec: 0,
      timelineId: engine.ascensionTimeline.id,
      worldId: engine.world.id,
      params: { speed: renderer.speed },
    };
    const decision = engine.gk.evaluateIntent(intent, evidence);
    if (!decision.ok) {
      throw new Error(
        `${decision.reason}: ${(decision.violations || []).join(", ")}`,
      );
    }
    engine.cssv?.registerTransition({
      intent,
      authority: "4dce.timeline",
      evidence,
      decision: { allowed: decision.ok, reasons: decision.violations ?? [] },
      timeSeconds: engine.timelinePlayer.timeSec,
    });
    if (decision.paramAdjust?.speed != null) {
      renderer.speed = Number(decision.paramAdjust.speed);
    }
    const { csr } = await governed({
      kind: "play_timeline",
      goal: `Play ${engine.ascensionTimeline.name} via ISL`,
      action: "timeline.play",
      actor: "4dce.timeline",
      evidence,
      run: async () => {
        engine.provenance?.clear();
        engine.timelinePlayer.reset();
        engine.timelinePlayer.play();
        return {
          timelineId: engine.ascensionTimeline.id,
          intentId: intent.id,
          decisionId: decision.decisionId,
          provenanceAttach: decision.attachProvenance,
        };
      },
    });
    setStatus(`Ascension ISL+CKL allow · CSR ${csr.id}`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Ascension play failed");
  }
});

btnPause.addEventListener("click", async () => {
  try {
    const { csr } = await governed({
      kind: "play_timeline",
      goal: "Pause cinematic timeline",
      action: "timeline.pause",
      actor: "4dce.timeline",
      evidence: {
        timestamp: new Date().toISOString(),
        timeSec: engine.timelinePlayer.timeSec,
        timelineId: engine.timeline.id,
      },
      run: async () => {
        engine.timelinePlayer.pause();
        return { timeSec: engine.timelinePlayer.timeSec };
      },
    });
    setStatus(`Paused @ ${csr.result.timeSec.toFixed(2)}s`);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Pause failed");
  }
});

window.addEventListener("resize", () => renderer.resize());

(async () => {
  try {
    engine = await bootEngine({ onRecord: () => refreshCsrLog() });
    charterBadge.textContent = `${engine.charter.id} · ${engine.charter.version}`;
    worldBadge.textContent = `${engine.world.name} · ${engine.world.id}`;

    engine.scene.bindFourDRenderer(renderer);
    syncSlidersFromRenderer();
    renderer.start();
    if (new URLSearchParams(location.search).get("nativePreview") === "1") {
      renderer.stop();
      const preview=new SharedFramePreview(canvas,async()=>{const response=await fetch("/__sovereignx/frame",{cache:"no-store"});if(!response.ok)throw new Error(`Native preview ${response.status}`);return response.arrayBuffer();});
      preview.start(16); window.sovereignXNativePreview=preview;
      document.getElementById("read-backend").textContent="Vulkan shared ring";
    }

    await governed({
      kind: "render.session",
      goal: "Boot governed Mythar Plains session",
      action: "render.session.start",
      evidence: {
        ...engine.evidence.fromRenderer(renderer),
        worldId: engine.world.id,
      },
      run: async () => ({ worldId: engine.world.id }),
    });

    setStatus("Boot complete — Play Opening or Mythar Ascension, or capture/export.");
    refreshCsrLog();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Boot failed");
    console.error(err);
  }
})();
