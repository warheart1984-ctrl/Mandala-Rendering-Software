"use strict";

const PRECISION = 6;
const STORAGE_KEY = "mrs.sovereign-sculptor.project.v1";
const $ = (selector) => document.querySelector(selector);
const elements = {
  canvas: $("#viewport"), canvasWrap: $("#canvas-wrap"), empty: $("#empty-state"),
  file: $("#project-file"), save: $("#save-local"), restore: $("#restore-local"), export: $("#export-json"),
  banner: $("#fixture-banner"), radius: $("#radius"), radiusValue: $("#radius-value"),
  strength: $("#strength"), strengthValue: $("#strength-value"), symmetry: $("#symmetry"),
  regionMask: $("#region-mask"), activeRegion: $("#active-region"), lockedMask: $("#locked-mask"),
  showMasks: $("#show-masks"), view: $("#view-readout"), axisH: $("#axis-h"), axisV: $("#axis-v"),
  title: $("#document-title"), meta: $("#document-meta"), vertices: $("#vertex-count"),
  triangles: $("#triangle-count"), selected: $("#selected-id"), status: $("#operation-status"),
  digest: $("#document-digest"), summary: $("#project-summary"), morphology: $("#morphology-json"),
  policy: $("#source-policy"), rigVersion: $("#rig-version"), rigSummary: $("#rig-summary"),
  bones: $("#bone-list"), shapes: $("#blendshape-list"), skin: $("#skin-editor"),
  recordStatus: $("#record-status"), record: $("#record-json"), dialog: $("#message-dialog"),
  dialogTitle: $("#dialog-title"), dialogMessage: $("#dialog-message"),
};
const context = elements.canvas.getContext("2d", { alpha: false });

function fixtureDocument() {
  return {
    schemaVersion: "sovereign-sculpt/1.0",
    status: "core-enforced-fixture-not-production-sculpt",
    id: "studio-preview-fixture",
    species: "human",
    topologyState: "authoring",
    topologyRevision: 0,
    identity: {
      id: "studio-preview-character",
      displayName: "Preview Character Fixture",
      gender: { identity: "creator-specified", attribution: "creator-authored" },
    },
    morphologyProfile: {
      stature: 0.5, bodyMass: 0.5, limbLength: 0.5, torsoLength: 0.5,
      headScale: 0.5, muzzleLength: 0, earScale: 0.2, tailLength: 0, digitigradeBias: 0,
    },
    vertices: [
      { id: "head.L", position: [-0.25, 1.75, 0] }, { id: "head.top", position: [0, 2.05, 0] },
      { id: "head.R", position: [0.25, 1.75, 0] }, { id: "neck", position: [0, 1.5, 0] },
      { id: "shoulder.L", position: [-0.55, 1.35, 0] }, { id: "chest", position: [0, 1.2, 0.1] },
      { id: "shoulder.R", position: [0.55, 1.35, 0] }, { id: "hand.L", position: [-0.82, 0.62, 0] },
      { id: "hip.L", position: [-0.28, 0.45, 0] }, { id: "pelvis", position: [0, 0.38, 0.08] },
      { id: "hip.R", position: [0.28, 0.45, 0] }, { id: "hand.R", position: [0.82, 0.62, 0] },
      { id: "knee.L", position: [-0.23, -0.3, 0] }, { id: "knee.R", position: [0.23, -0.3, 0] },
      { id: "foot.L", position: [-0.3, -1.05, 0.12] }, { id: "foot.R", position: [0.3, -1.05, 0.12] },
    ],
    triangles: [
      [0,1,3,"face"],[1,2,3,"face"],[3,4,5,"torso"],[3,5,6,"torso"],
      [4,7,8,"arm.L"],[4,8,5,"torso"],[5,8,9,"torso"],[5,9,10,"torso"],
      [5,10,6,"torso"],[6,10,11,"arm.R"],[8,12,9,"leg.L"],[9,12,13,"legs"],
      [9,13,10,"leg.R"],[12,14,13,"leg.L"],[13,14,15,"leg.R"],
    ].map(([a,b,c,regionId], index) => ({ id: `triangle:${index}`, vertexIndices: [a,b,c], regionId })),
    regions: [
      { id: "face", vertexIndices: [0,1,2,3] }, { id: "torso", vertexIndices: [3,4,5,6,8,9,10] },
      { id: "arms", vertexIndices: [4,6,7,11] }, { id: "legs", vertexIndices: [8,9,10,12,13,14,15] },
    ],
    masks: [{ id: "locked", weights: Array.from({ length: 16 }, (_, index) => index === 1 || index === 9 ? 1 : 0) }],
    operationLog: [],
  };
}

const state = {
  document: fixtureDocument(), rig: null, skinLayers: [], record: null,
  isFixture: true, staleSidecars: false, selected: null, view: "front", drag: null, projection: null,
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const quantize = (value) => Number(Number(value).toFixed(PRECISION));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((out, key) => {
    if (value[key] !== undefined) out[key] = canonical(value[key]);
    return out;
  }, {});
  return Object.is(value, -0) ? 0 : value;
}
async function sha256(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function projectEnvelope() {
  if (!state.rig && !state.skinLayers.length && !state.record) return state.document;
  return {
    schemaVersion: "sovereign-sculptor-project/1.0",
    document: state.document,
    rig: state.rig,
    skinLayers: state.skinLayers,
    record: state.staleSidecars ? null : state.record,
  };
}

function decodeProject(value) {
  if (value?.schemaVersion === "sovereign-sculpt/1.0") {
    return { document: value, rig: null, skinLayers: [], record: null };
  }
  if (value?.schemaVersion === "sovereign-sculptor-project/1.0" && value.document) {
    return { document: value.document, rig: value.rig ?? null, skinLayers: value.skinLayers ?? [], record: value.record ?? null };
  }
  throw new Error("Expected a sovereign-sculpt/1.0 document or sovereign-sculptor-project/1.0 envelope.");
}

function validateSculptDocument(documentValue) {
  const errors = [];
  if (documentValue?.schemaVersion !== "sovereign-sculpt/1.0") errors.push("Unsupported document schema.");
  if (!["human", "fox", "anthro"].includes(documentValue?.species)) errors.push("Species must be human, fox, or anthro.");
  if (!["authoring", "locked"].includes(documentValue?.topologyState)) errors.push("Topology state is required.");
  if (!Number.isInteger(documentValue?.topologyRevision) || documentValue.topologyRevision < 0) errors.push("Topology revision must be nonnegative.");
  if (!documentValue?.identity?.gender?.identity) errors.push("Creator-supplied identity metadata is required.");
  if (!Array.isArray(documentValue?.vertices) || documentValue.vertices.length < 1) errors.push("Vertices are required.");
  if (!Array.isArray(documentValue?.triangles) || documentValue.triangles.length < 1) errors.push("Triangles are required.");
  const ids = new Set();
  (documentValue?.vertices ?? []).forEach((vertex, index) => {
    if (!vertex.id || ids.has(vertex.id)) errors.push(`Vertex ${index} has a duplicate or empty stable ID.`);
    ids.add(vertex.id);
    if (!Array.isArray(vertex.position) || vertex.position.length !== 3 || vertex.position.some((number) => !Number.isFinite(number))) errors.push(`Vertex ${index} position is invalid.`);
  });
  (documentValue?.triangles ?? []).forEach((triangle, index) => {
    if (!Array.isArray(triangle.vertexIndices) || triangle.vertexIndices.length !== 3 || triangle.vertexIndices.some((vertexIndex) => !Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= documentValue.vertices.length)) errors.push(`Triangle ${index} is invalid.`);
  });
  (documentValue?.masks ?? []).forEach((mask) => {
    if (!Array.isArray(mask.weights) || mask.weights.length !== documentValue.vertices.length) errors.push(`Mask ${mask.id} length does not match vertices.`);
  });
  return [...new Set(errors)];
}

function setProject(decoded, fixture = false) {
  const errors = validateSculptDocument(decoded.document);
  if (errors.length) throw new Error(errors.join("\n"));
  state.document = clone(decoded.document);
  state.rig = decoded.rig ? clone(decoded.rig) : null;
  state.skinLayers = clone(decoded.skinLayers ?? []);
  state.record = decoded.record ? clone(decoded.record) : null;
  state.isFixture = fixture;
  state.staleSidecars = false;
  state.selected = null;
  populateRegions();
  renderAll();
}

function showMessage(title, message) {
  elements.dialogTitle.textContent = title;
  elements.dialogMessage.textContent = message;
  if (typeof elements.dialog.showModal === "function") elements.dialog.showModal();
  else alert(`${title}\n\n${message}`);
}

function populateRegions() {
  elements.activeRegion.replaceChildren();
  for (const region of state.document.regions) {
    const option = document.createElement("option");
    option.value = region.id; option.textContent = region.id;
    elements.activeRegion.append(option);
  }
}

function axes() {
  if (state.view === "side") return [2, 1, "Z", "Y"];
  if (state.view === "top") return [0, 2, "X", "Z"];
  return [0, 1, "X", "Y"];
}

function resizeCanvas() {
  const rect = elements.canvasWrap.getBoundingClientRect();
  const ratio = devicePixelRatio || 1;
  elements.canvas.width = Math.max(1, Math.round(rect.width * ratio));
  elements.canvas.height = Math.max(1, Math.round(rect.height * ratio));
  elements.canvas.style.width = `${rect.width}px`;
  elements.canvas.style.height = `${rect.height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

function projection() {
  const [horizontal, vertical] = axes();
  const points = state.document.vertices.map((vertex) => [vertex.position[horizontal], vertex.position[vertical]]);
  const width = elements.canvas.clientWidth || 1, height = elements.canvas.clientHeight || 1;
  const minX = Math.min(...points.map((point) => point[0])), maxX = Math.max(...points.map((point) => point[0]));
  const minY = Math.min(...points.map((point) => point[1])), maxY = Math.max(...points.map((point) => point[1]));
  const scale = Math.min((width - 80) / Math.max(0.1, maxX - minX), (height - 80) / Math.max(0.1, maxY - minY));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return { horizontal, vertical, scale, width, height, points: points.map(([x,y]) => [width/2 + (x-cx)*scale, height/2 - (y-cy)*scale]) };
}

function lockedWeight(index) {
  return state.document.masks.find((mask) => mask.id === "locked")?.weights[index] ?? 0;
}

function draw() {
  const width = elements.canvas.clientWidth, height = elements.canvas.clientHeight;
  context.fillStyle = "#11161d"; context.fillRect(0, 0, width, height);
  if (!state.document.vertices.length) { elements.empty.hidden = false; return; }
  elements.empty.hidden = true;
  state.projection = projection();
  context.lineWidth = 1.25;
  for (const triangle of state.document.triangles) {
    const points = triangle.vertexIndices.map((index) => state.projection.points[index]);
    if (points.some((point) => !point)) continue;
    context.beginPath(); context.moveTo(...points[0]); context.lineTo(...points[1]); context.lineTo(...points[2]); context.closePath();
    context.fillStyle = triangle.regionId === "face" ? "rgba(52,184,255,.18)" : "rgba(124,95,255,.12)";
    context.strokeStyle = "rgba(160,190,220,.55)"; context.fill(); context.stroke();
  }
  state.projection.points.forEach((point, index) => {
    const vertex = state.document.vertices[index];
    const locked = lockedWeight(index) > 0.5;
    if (locked && !elements.showMasks.checked) return;
    context.beginPath(); context.arc(point[0], point[1], state.selected === vertex.id ? 6 : 4, 0, Math.PI * 2);
    context.fillStyle = state.selected === vertex.id ? "#ffcf56" : locked ? "#f06a83" : "#55d6be";
    context.fill();
  });
}

function item(parent, title, subtitle = "") {
  const row = document.createElement("div"); row.className = "item";
  const strong = document.createElement("strong"); strong.textContent = title; row.append(strong);
  if (subtitle) { const small = document.createElement("small"); small.textContent = subtitle; row.append(small); }
  parent.append(row);
}

async function updateDigest() {
  elements.digest.textContent = `Project SHA-256: ${await sha256(state.document)}`;
}

function renderInspector() {
  const doc = state.document;
  elements.title.textContent = doc.identity.displayName;
  elements.meta.textContent = `${doc.species} · topology ${doc.topologyState} r${doc.topologyRevision}`;
  elements.vertices.textContent = String(doc.vertices.length); elements.triangles.textContent = String(doc.triangles.length);
  elements.selected.textContent = state.selected ?? "none";
  elements.banner.hidden = !state.isFixture;
  elements.summary.innerHTML = `<dt>ID</dt><dd>${doc.identity.id}</dd><dt>Species</dt><dd>${doc.species}</dd><dt>Identity</dt><dd>${doc.identity.gender.identity}</dd><dt>Topology</dt><dd>${doc.topologyState} · revision ${doc.topologyRevision}</dd>`;
  elements.morphology.textContent = JSON.stringify(doc.morphologyProfile, null, 2);
  elements.policy.innerHTML = "<span class='status-dot safe'>sculpt owns anatomy</span><span class='status-dot safe'>diffusion surface only</span><span class='status-dot safe'>runtime retopology denied</span>";
  elements.rigVersion.textContent = state.rig?.schemaVersion ?? "none";
  elements.rigSummary.textContent = state.rig ? `${state.rig.species} · ${state.rig.id} · ${state.rig.bones.length} bones` : "Load a project envelope containing a CharacterRigSchema.";
  elements.bones.replaceChildren(); (state.rig?.bones ?? []).forEach((bone) => item(elements.bones, bone.id, bone.parentId ? `parent ${bone.parentId}` : "root"));
  elements.shapes.replaceChildren(); (state.rig?.blendshapes ?? []).forEach((shape) => item(elements.shapes, shape.id, `${shape.regionId} · ${shape.minWeight}–${shape.maxWeight}`));
  elements.skin.replaceChildren();
  if (!state.skinLayers.length) item(elements.skin, "No skin layer", "Bind validated texture references through the CLI/API.");
  for (const layer of state.skinLayers) {
    item(elements.skin, layer.id, `${Object.keys(layer.textureChannels ?? {}).join(", ")} · anatomyMutationAllowed=${layer.anatomyMutationAllowed}`);
  }
  elements.recordStatus.textContent = state.staleSidecars ? "Record invalidated by position edit; re-export and re-validate." : state.record ? "Constitutional record loaded." : "No constitutional record loaded.";
  elements.recordStatus.className = `record-status ${state.staleSidecars ? "warning" : ""}`;
  elements.record.textContent = JSON.stringify(state.staleSidecars ? null : state.record, null, 2);
  elements.status.textContent = state.isFixture ? "Ready · preview fixture is not production anatomy" : state.staleSidecars ? "Edited · re-export GLB and constitutional record" : "Ready · governed document loaded";
  updateDigest();
}

function renderAll() { draw(); renderInspector(); }

function nearestVertex(x, y) {
  if (!state.projection) return null;
  let best = null, distance = 16;
  state.projection.points.forEach((point, index) => {
    const current = Math.hypot(point[0] - x, point[1] - y);
    if (current < distance) { distance = current; best = index; }
  });
  return best;
}

function regionHas(index) {
  if (!elements.regionMask.checked) return true;
  return state.document.regions.find((region) => region.id === elements.activeRegion.value)?.vertexIndices.includes(index) ?? false;
}

function mirrorIndex(index) {
  const position = state.document.vertices[index].position;
  if (Math.abs(position[0]) < 1e-8) return index;
  let best = -1, distance = Infinity;
  state.document.vertices.forEach((vertex, candidate) => {
    const d = Math.hypot(vertex.position[0] + position[0], vertex.position[1] - position[1], vertex.position[2] - position[2]);
    if (d < distance) { distance = d; best = candidate; }
  });
  return distance < 1e-4 ? best : -1;
}

function moveBrush(selectedIndex, dxPixels, dyPixels) {
  const projectionValue = state.projection;
  const radius = Number(elements.radius.value), strength = Number(elements.strength.value);
  const selectedPosition = state.document.vertices[selectedIndex].position;
  const delta = [0, 0, 0];
  delta[projectionValue.horizontal] = dxPixels / projectionValue.scale * strength;
  delta[projectionValue.vertical] = -dyPixels / projectionValue.scale * strength;
  state.document.vertices.forEach((vertex, index) => {
    if (!regionHas(index) || (elements.lockedMask.checked && lockedWeight(index) > 0.5)) return;
    const distance = Math.hypot(vertex.position[0]-selectedPosition[0], vertex.position[1]-selectedPosition[1], vertex.position[2]-selectedPosition[2]);
    if (distance > radius) return;
    const weight = 1 - distance / Math.max(radius, 1e-9);
    vertex.position = vertex.position.map((value, axis) => quantize(value + delta[axis] * weight));
    if (elements.symmetry.checked) {
      const mirror = mirrorIndex(index);
      if (mirror >= 0 && mirror !== index && regionHas(mirror) && !(elements.lockedMask.checked && lockedWeight(mirror) > 0.5)) {
        const mirrored = state.document.vertices[mirror].position;
        mirrored[0] = quantize(mirrored[0] - delta[0] * weight);
        mirrored[1] = quantize(mirrored[1] + delta[1] * weight);
        mirrored[2] = quantize(mirrored[2] + delta[2] * weight);
      }
    }
  });
  state.staleSidecars = Boolean(state.rig || state.skinLayers.length || state.record);
}

function pointer(event) {
  const rect = elements.canvas.getBoundingClientRect();
  return [event.clientX - rect.left, event.clientY - rect.top];
}

elements.canvas.addEventListener("pointerdown", (event) => {
  const [x,y] = pointer(event); const index = nearestVertex(x,y);
  if (index == null) return;
  state.selected = state.document.vertices[index].id;
  state.drag = { index, x, y, before: clone(state.document.vertices.map((vertex) => vertex.position)) };
  elements.canvas.setPointerCapture(event.pointerId); renderAll();
});
elements.canvas.addEventListener("pointermove", (event) => {
  if (!state.drag) return;
  const [x,y] = pointer(event);
  state.document.vertices.forEach((vertex, index) => { vertex.position = clone(state.drag.before[index]); });
  moveBrush(state.drag.index, x-state.drag.x, y-state.drag.y); renderAll();
});
elements.canvas.addEventListener("pointerup", async (event) => {
  if (!state.drag) return;
  const operation = { id: `studio-move:${state.document.operationLog.length}`, kind: "move", selectedVertexId: state.document.vertices[state.drag.index].id, radius: Number(elements.radius.value), strength: Number(elements.strength.value), symmetry: elements.symmetry.checked };
  state.document.operationLog.push({ id: operation.id, kind: "move", operationHash: await sha256(operation) });
  state.drag = null; elements.canvas.releasePointerCapture(event.pointerId); renderAll();
});

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
  state.view = button.dataset.view;
  document.querySelectorAll("[data-view]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  const labels = state.view === "side" ? ["Side","Z","Y"] : state.view === "top" ? ["Top","X","Z"] : ["Front","X","Y"];
  elements.view.textContent = labels[0]; elements.axisH.textContent = labels[1]; elements.axisV.textContent = labels[2]; draw();
}));
document.querySelectorAll("[data-pane]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-pane]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  document.querySelectorAll(".pane").forEach((pane) => pane.classList.toggle("active", pane.id === `pane-${button.dataset.pane}`));
}));

for (const control of [elements.radius, elements.strength]) control.addEventListener("input", () => {
  elements.radiusValue.textContent = Number(elements.radius.value).toFixed(2);
  elements.strengthValue.textContent = Number(elements.strength.value).toFixed(2);
});
elements.showMasks.addEventListener("change", draw);

elements.file.addEventListener("change", async () => {
  try {
    const value = JSON.parse(await elements.file.files[0].text());
    setProject(decodeProject(value));
  } catch (error) { showMessage("Load rejected", error.message); }
  elements.file.value = "";
});
elements.save.addEventListener("click", () => {
  if (state.isFixture) return showMessage("Fixture not saved", "Load a governed document first.");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projectEnvelope()));
  elements.status.textContent = "Snapshot saved locally";
});
elements.restore.addEventListener("click", () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) throw new Error("No local snapshot exists.");
    setProject(decodeProject(JSON.parse(value)));
  } catch (error) { showMessage("Restore failed", error.message); }
});
elements.export.addEventListener("click", () => {
  if (state.isFixture) return showMessage("Fixture not exported", "Load a governed document first.");
  const blob = new Blob([`${JSON.stringify(projectEnvelope(), null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
  link.download = `${state.document.id}.json`; link.click(); URL.revokeObjectURL(link.href);
});

new ResizeObserver(resizeCanvas).observe(elements.canvasWrap);
populateRegions(); renderAll(); resizeCanvas();
