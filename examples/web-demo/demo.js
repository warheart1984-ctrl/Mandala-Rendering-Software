/**
 * 4DRS interactive web demo — Canvas 2D path only.
 *
 * Evidence-bound: uses CanvasRenderer + surfaces registry + presentation profiles.
 * Does not claim WebGPU bloom, shadows, LOD, microphone, or GLTF browser export.
 *
 * Deep imports avoid package entry modules that pull Node-only deps (canvas/fs).
 */
import {
  CanvasRenderer,
} from "../../4d-renderer/src/render/canvas-renderer.js";
import {
  getSurface,
  sampleSurface,
  listSurfaces,
} from "../../4d-renderer/src/surfaces/index.js";
import {
  getRenderProfile,
  renderProfiles,
} from "../../4d-renderer/src/render/profiles.js";
import { Camera4D } from "../../4d-renderer/src/camera/Camera4D.js";
import { HyperplaneSlicer } from "../../4d-renderer/src/render/slicer.js";

const QUALITY_RES = {
  performance: 16,
  balanced: 28,
  high: 40,
  ultra: 56,
};

const state = {
  surfaceId: "tesseract",
  mode: "wireframe",
  profile: "technical",
  quality: "high",
  speed: 0.55,
  theta: 0,
  scale: 90,
  d4: 4,
  d3: 4,
  cameraY: 0,
  running: true,
  sliceMode: false,
  sliceD: 0,
  mesh: null,
  last: 0,
  fps: 0,
  fpsSamples: [],
};

const canvas = document.getElementById("stage");
const el = {
  surface: document.getElementById("ctrl-surface"),
  mode: document.getElementById("ctrl-mode"),
  profile: document.getElementById("ctrl-profile"),
  quality: document.getElementById("ctrl-quality"),
  speed: document.getElementById("ctrl-speed"),
  slice: document.getElementById("ctrl-slice"),
  sliceD: document.getElementById("ctrl-slice-d"),
  fps: document.getElementById("read-fps"),
  verts: document.getElementById("read-verts"),
  edges: document.getElementById("read-edges"),
  theta: document.getElementById("read-theta"),
  path: document.getElementById("read-path"),
};

const core = new CanvasRenderer(canvas, {
  background: "#0e1216",
  renderMode: state.mode,
  profile: state.profile,
  scale: state.scale,
  d4: state.d4,
  d3: state.d3,
  scaleMode: "fit",
});

const camera4d = new Camera4D({
  position: { x: 0, y: 0, z: 0, w: 0 },
  normal: { x: 0, y: 0, z: 0, w: 1 },
  d: 0,
  projectionMode: "perspective",
});
const slicer = new HyperplaneSlicer(camera4d, {
  renderMode: "both",
  background: "#0e1216",
  showSlicePlane: true,
});

function fillSelects() {
  for (const s of listSurfaces()) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    if (s.id === state.surfaceId) opt.selected = true;
    el.surface.appendChild(opt);
  }
  for (const name of Object.keys(renderProfiles)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === state.profile) opt.selected = true;
    el.profile.appendChild(opt);
  }
}

function loadMesh() {
  const res =
    state.surfaceId === "tesseract" ? null : QUALITY_RES[state.quality];
  state.mesh = sampleSurface(getSurface(state.surfaceId), res);
  el.verts.textContent = String(state.mesh.vertices.length);
  el.edges.textContent = String(state.mesh.edges.length);
}

function applyProfile() {
  const style = getRenderProfile(state.profile);
  state.mode = el.mode.value || style.renderMode || state.mode;
  Object.assign(core, {
    background: style.background,
    renderMode: state.mode,
    scaleMode: style.scaleMode ?? "fit",
    padding: style.padding ?? 0.12,
  });
  core.style = { ...core.style, ...style };
  core.framing.reset();
  el.mode.value = state.mode;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  core.setViewSize(rect.width, rect.height);
}

function bindNav() {
  let pointer = null;
  canvas.addEventListener("pointerdown", (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointer) return;
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    state.theta += dx * 0.008;
    state.cameraY = Math.max(-400, Math.min(400, state.cameraY - dy * 1.4));
    if (state.sliceMode) {
      state.sliceD = Math.max(-2.5, Math.min(2.5, state.sliceD + dy * 0.004));
      el.sliceD.value = String(state.sliceD);
      camera4d.setHyperplaneOffset(state.sliceD);
    }
    pointer = { x: e.clientX, y: e.clientY };
  });
  const release = () => {
    pointer = null;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.001);
      state.scale = Math.max(24, Math.min(240, state.scale * factor));
    },
    { passive: false }
  );
}

function syncCore() {
  core.d4 = state.d4;
  core.d3 = state.d3;
  core.scale = state.scale;
  core.cameraY = state.cameraY;
  core.renderMode = state.mode;
}

function drawFrame(dt) {
  if (dt > 0 && state.running) {
    state.theta += state.speed * dt;
    state.fpsSamples.push(1 / dt);
    if (state.fpsSamples.length > 40) state.fpsSamples.shift();
    state.fps =
      state.fpsSamples.reduce((a, b) => a + b, 0) / state.fpsSamples.length;
  }

  const w = canvas.getBoundingClientRect().width;
  const h = canvas.getBoundingClientRect().height;
  const ctx = canvas.getContext("2d");

  if (state.sliceMode) {
    camera4d.width = w;
    camera4d.height = h;
    camera4d.scale = state.scale * 0.9;
    camera4d.d3 = state.d3;
    camera4d.setHyperplaneOffset(state.sliceD);
    camera4d.temporalParam = state.theta;
    if (typeof camera4d.orbit === "function") {
      camera4d.orbit(state.theta, 0.35);
    }
    slicer.renderMode = state.mode === "wireframe" ? "wireframe" : "both";
    slicer.background = core.background;
    slicer.renderFrame(ctx, state.mesh, {
      renderMode: slicer.renderMode,
      solidOptions: core.style,
      wireframeOptions: { lineWidth: core.style.lineWidth ?? 1.1 },
    });
    el.path.textContent = "HyperplaneSlicer + Camera4D";
  } else {
    syncCore();
    core.renderFrame(state.mesh, state.theta, {
      renderMode: state.mode,
      cameraY: state.cameraY,
    });
    el.path.textContent = "CanvasRenderer (4D→3D→2D)";
  }

  el.fps.textContent = state.fps.toFixed(0);
  el.theta.textContent = state.theta.toFixed(2);
}

function loop(now) {
  const dt = state.last ? Math.min(0.05, (now - state.last) / 1000) : 0;
  state.last = now;
  drawFrame(dt);
  requestAnimationFrame(loop);
}

function exportPng() {
  const a = document.createElement("a");
  a.download = `4drs-${state.surfaceId}-${state.mode}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

function resetView() {
  state.theta = 0;
  state.scale = 90;
  state.d4 = 4;
  state.d3 = 4;
  state.cameraY = 0;
  state.sliceD = 0;
  el.sliceD.value = "0";
  core.framing.reset();
  camera4d.setHyperplaneOffset(0);
}

fillSelects();
loadMesh();
applyProfile();
resize();
bindNav();

el.surface.addEventListener("change", () => {
  state.surfaceId = el.surface.value;
  loadMesh();
});
el.mode.addEventListener("change", () => {
  state.mode = el.mode.value;
});
el.profile.addEventListener("change", () => {
  state.profile = el.profile.value;
  applyProfile();
});
el.quality.addEventListener("change", () => {
  state.quality = el.quality.value;
  loadMesh();
});
el.speed.addEventListener("input", () => {
  state.speed = Number(el.speed.value);
});
el.slice.addEventListener("change", () => {
  state.sliceMode = el.slice.checked;
  el.sliceD.disabled = !state.sliceMode;
});
el.sliceD.addEventListener("input", () => {
  state.sliceD = Number(el.sliceD.value);
});

document.getElementById("btn-toggle").addEventListener("click", () => {
  state.running = !state.running;
  document.getElementById("btn-toggle").textContent = state.running
    ? "Pause rotation"
    : "Resume rotation";
});
document.getElementById("btn-reset").addEventListener("click", resetView);
document.getElementById("btn-png").addEventListener("click", exportPng);

window.addEventListener("resize", resize);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    document.getElementById("btn-toggle").click();
  }
  if (e.key === "r" || e.key === "R") resetView();
});

if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
  state.speed = 0;
  el.speed.value = "0";
}

requestAnimationFrame(loop);
