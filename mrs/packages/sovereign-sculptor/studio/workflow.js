"use strict";

const state = { species: "human", workflow: null, stem: "", active: 0, blenderReport: null, blenderReplay: null };
const elements = {
  pipeline: document.querySelector("#pipeline"), artifactTitle: document.querySelector("#artifact-title"),
  artifactBody: document.querySelector("#artifact-body"), artifactLink: document.querySelector("#artifact-link"),
  artifactImage: document.querySelector("#artifact-image"), humanTitle: document.querySelector("#artifact-human-title"),
  humanCopy: document.querySelector("#artifact-human-copy"),
  sealTitle: document.querySelector("#seal-title"), sealDetail: document.querySelector("#seal-detail"),
  topology: document.querySelector("#topology"), replay: document.querySelector("#replay"),
  blenderGeometry: document.querySelector("#blender-geometry"), blenderBones: document.querySelector("#blender-bones"),
  blenderMorphs: document.querySelector("#blender-morphs"), blenderReplay: document.querySelector("#blender-replay"),
  blenderDigest: document.querySelector("#blender-digest"),
};

const VISUALS = [
  { image: "assets/workflow-triptych.png", position: "left", title: "Shape the character once", copy: "The face and body are authored as stable geometry. This is the anatomy Mandala will reference in every shot." },
  { image: "assets/workflow-triptych.png", position: "center", title: "Give the anatomy a skeleton", copy: "Face, jaw, spine, hands, paws, ears, and tail receive declared controls so motion stays intentional." },
  { image: "assets/workflow-triptych.png", position: "left", title: "Package one replayable 3D character", copy: "The locked mesh, UVs, armature, and blendshape targets become a strict GLB that can be validated anywhere." },
  { image: "assets/workflow-triptych.png", position: "right", title: "Let local AI paint—inside a hard boundary", copy: "SME-style authority grants let SD-GGUF propose anime color, fur, markings, cel shade, and normal detail for the exact UV set. It receives no authority to change anatomy." },
  { image: "assets/character-lineup.png", position: "center", title: "Seal the character's identity", copy: "The sculpt, rig, skin, rights, and content hashes become one constitutional record. Drift becomes detectable." },
  { image: "assets/character-lineup.png", position: "center", title: "Mandala points to facts, not vibes", copy: "Creative intent selects a governed character, material profile, pose, camera, and timeline instead of reimagining anatomy." },
  { image: "assets/workflow-triptych.png", position: "right", title: "Make the character perform", copy: "Dialogue and animation drive declared facial shapes and bones. The speaking result is deterministic and replayable." },
];
const BLENDER_VISUAL = {
  image: "/fixtures/blender-anthro-v1/anthro-blender-preview.png", position: "center",
  title: "See the governed character as real 3D geometry",
  copy: "This frame was rendered locally by Blender from the exported anthro rig. Its mesh, UVs, skin weights, facial shapes, animation, and material policy all pass the same strict validator used by Mandala.",
};
const SILHOUETTE_VISUAL = {
  image: "/fixtures/blender-anthro-v1/anthro-blender-silhouette.png", position: "center",
  title: "Judge the living silhouette before the shaders",
  copy: "This pure-black diagnostic exposes the chest-to-waist rhythm, deltoid wrap, digitigrade joint tapers, paw arches, and toe curves. Mandala's existing shaders remain responsible for the final cel, outline, fur, skin, and RT4D appearance.",
};

function visualFor(index) {
  if (state.species === "anthro" && index === 0 && state.blenderReport) return SILHOUETTE_VISUAL;
  return state.species === "anthro" && [1, 2, 5, 6].includes(index) ? BLENDER_VISUAL : VISUALS[index];
}

function short(digest) { return `${digest.slice(0, 10)}…${digest.slice(-6)}`; }
function label(stage) { return stage.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "); }
function usesActualBlenderGlb(stage) { return state.species === "anthro" && stage.artifact.endsWith(".glb") && state.blenderReport; }
function artifactUrl(stage) {
  return usesActualBlenderGlb(stage)
    ? "/fixtures/blender-anthro-v1/anthro-blender-character.glb"
    : `/fixtures/${state.species}/${stage.artifact}`;
}
function stageDigest(stage) {
  return usesActualBlenderGlb(stage) ? state.blenderReport.constitutionalValidation.digests.glbSha256 : stage.digest;
}

async function inspectStage(index) {
  state.active = index;
  const stage = state.workflow.stages[index];
  document.querySelectorAll(".stage").forEach((node, item) => node.classList.toggle("active", item === index));
  elements.artifactTitle.textContent = label(stage.stage);
  elements.artifactLink.href = artifactUrl(stage);
  const visual = visualFor(index);
  elements.artifactImage.src = visual.image;
  elements.artifactImage.style.objectPosition = visual.position;
  elements.humanTitle.textContent = visual.title;
  elements.humanCopy.textContent = visual.copy;
  if (stage.artifact.endsWith(".glb")) {
    const response = await fetch(artifactUrl(stage));
    const bytes = await response.arrayBuffer();
    elements.artifactBody.textContent = [
      "GLB 2.0 binary validated by the strict local parser", "", `File: ${usesActualBlenderGlb(stage) ? "anthro-blender-character.glb" : stage.artifact}`,
      `Bytes: ${bytes.byteLength.toLocaleString()}`, `SHA-256: ${stageDigest(stage)}`, "",
      "The GLB carries the mesh, UVs, material slot, armature, skin binding,",
      "and declared blendshape targets. Logical sub-digests are recorded in",
      usesActualBlenderGlb(stage) ? "anthro-blender-adapter-report.json." : `${state.stem}.inspection.json.`,
    ].join("\n");
    return;
  }
  const response = await fetch(artifactUrl(stage));
  const text = await response.text();
  elements.artifactBody.textContent = text;
}

function renderPipeline() {
  elements.pipeline.replaceChildren(...state.workflow.stages.map((stage, index) => {
    const button = document.createElement("button");
    button.className = "stage";
    button.type = "button";
    const visual = visualFor(index);
    button.style.setProperty("--stage-image", `url('${visual.image}')`);
    button.style.setProperty("--stage-position", visual.position);
    button.innerHTML = `<span class="number">${String(index + 1).padStart(2, "0")}</span><b>${label(stage.stage)}</b><code>${short(stageDigest(stage))}</code><small>verified</small>`;
    button.addEventListener("click", () => inspectStage(index).catch(showError));
    return button;
  }));
}

function showError(error) {
  elements.sealTitle.textContent = "Evidence unavailable";
  elements.sealDetail.textContent = error.message;
  elements.artifactBody.textContent = error.stack || error.message;
}

async function loadSpecies(species) {
  state.species = species;
  state.stem = `${species}-character-fixture`;
  document.querySelectorAll("[data-species]").forEach((button) => button.classList.toggle("active", button.dataset.species === species));
  const [workflowResponse, recordResponse] = await Promise.all([
    fetch(`/fixtures/${species}/${state.stem}.workflow.json`),
    fetch(`/fixtures/${species}/${state.stem}.constitutional.json`),
  ]);
  if (!workflowResponse.ok || !recordResponse.ok) throw new Error("Run the demo through the Sovereign Sculptor CLI after generating fixtures.");
  state.workflow = await workflowResponse.json();
  const record = await recordResponse.json();
  elements.sealTitle.textContent = `${species[0].toUpperCase() + species.slice(1)} evidence sealed`;
  elements.sealDetail.textContent = `Record ${short(record.recordDigest)} · ${state.workflow.stages.length} stages`;
  elements.topology.textContent = `Locked r${record.topology.revision}`;
  elements.replay.textContent = short(state.workflow.stages.at(-1).digest);
  renderPipeline();
  await inspectStage(Math.min(state.active, state.workflow.stages.length - 1));
}

async function loadBlenderProof() {
  const [reportResponse, replayResponse] = await Promise.all([
    fetch("/fixtures/blender-anthro-v1/anthro-blender-adapter-report.json"),
    fetch("/fixtures/blender-anthro-v1/anthro-blender-replay-audit.json"),
  ]);
  if (!reportResponse.ok || !replayResponse.ok) throw new Error("Actual Blender proof has not been generated yet.");
  const report = await reportResponse.json();
  const replay = await replayResponse.json();
  state.blenderReport = report;
  state.blenderReplay = replay;
  const proof = report.constitutionalValidation;
  elements.blenderGeometry.textContent = `${proof.primitives} parts · ${proof.vertices.toLocaleString()} vertices`;
  elements.blenderBones.textContent = `${proof.bones} bones`;
  elements.blenderMorphs.textContent = `${proof.morphs.length} facial shapes`;
  elements.blenderReplay.textContent = replay.glb.byteIdentical ? "Byte replay passed" : "Semantic replay only";
  elements.blenderDigest.textContent = `GLB ${short(proof.digests.glbSha256)}`;
  if (state.species === "anthro" && state.workflow) {
    renderPipeline();
    await inspectStage(Math.min(state.active, state.workflow.stages.length - 1));
  }
}

document.querySelectorAll("[data-species]").forEach((button) => button.addEventListener("click", () => loadSpecies(button.dataset.species).catch(showError)));
loadSpecies("human").catch(showError);
loadBlenderProof().catch((error) => {
  elements.blenderReplay.textContent = "Proof unavailable";
  elements.blenderDigest.textContent = error.message;
});
