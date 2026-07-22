/**
 * Inspector scene bind helpers (Unity → WS server).
 * Status (Drive-G-1): prepares / wires Editor scene identity for picking —
 * not production multi-user scene sync.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultInspectorTestMesh } from "./defaultTestMesh.js";
import { dropWProjectionMatrix, vec4 } from "./types.js";

export const DEFAULT_SCENE_ID = "default_test_mesh";
export const SCENE_SCHEMA_VERSION = "1.1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo-relative default: engine/surfaces/meshes (shared with Unity SurfaceMeshLoader). */
export function defaultMeshesRoot() {
  return path.resolve(__dirname, "../../../engine/surfaces/meshes");
}

/**
 * @typedef {{ id: string, source: string, label: string, meshAssetId?: string|null, vertexCount: number, faceCount: number, boundAt: number|null }} SceneBindingStatus
 */

/**
 * @returns {{ mesh: object, camera: object, projectionMatrix: number[][], hyperplanes: object[], rotationPlanes: object[], status: SceneBindingStatus }}
 */
export function createDefaultSceneBinding() {
  const mesh = createDefaultInspectorTestMesh();
  return {
    mesh,
    camera: { d4: 4, d3: 4, scale: 80 },
    projectionMatrix: dropWProjectionMatrix(),
    hyperplanes: [{ normal: vec4(0, 0, 1, 0), d: -0.1 }],
    rotationPlanes: [
      {
        axisA: vec4(1, 0, 0, 0),
        axisB: vec4(0, 0, 0, 1),
        angle: 0.1,
        label: "x-w",
      },
    ],
    status: {
      id: DEFAULT_SCENE_ID,
      source: "default",
      label: `scene: ${DEFAULT_SCENE_ID}`,
      meshAssetId: null,
      vertexCount: mesh.vertices.length,
      faceCount: mesh.faces.length,
      boundAt: null,
    },
  };
}

/**
 * Normalize wire mesh → { vertices: Vec4[], faces: number[][] }.
 * Accepts vertices as {x,y,z,w} or [x,y,z,w]; faces as triples.
 */
export function normalizeWireMesh(raw) {
  if (!raw || typeof raw !== "object") return null;
  const vertsIn = raw.vertices ?? raw.v;
  const facesIn = raw.faces ?? raw.f;
  if (!Array.isArray(vertsIn) || !Array.isArray(facesIn) || vertsIn.length === 0 || facesIn.length === 0) {
    return null;
  }
  const vertices = vertsIn.map((v) => {
    if (Array.isArray(v)) return vec4(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0);
    return vec4(v.x ?? 0, v.y ?? 0, v.z ?? 0, v.w ?? 0);
  });
  const faces = facesIn.map((f) => {
    if (Array.isArray(f)) return [Number(f[0]), Number(f[1]), Number(f[2])];
    return [0, 0, 0];
  }).filter((f) => f.every((i) => Number.isFinite(i) && i >= 0 && i < vertices.length));
  if (faces.length === 0) return null;
  return { vertices, faces };
}

/**
 * Load registered mesh asset from engine/surfaces/meshes/<id>.mesh.json.
 * @param {string} meshAssetId
 * @param {string} [meshesRoot]
 */
export function loadMeshAsset(meshAssetId, meshesRoot = defaultMeshesRoot()) {
  if (!meshAssetId || typeof meshAssetId !== "string") return null;
  const safe = meshAssetId.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe || safe !== meshAssetId) return null;
  const filePath = path.join(meshesRoot, `${safe}.mesh.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return normalizeWireMesh(json);
  } catch {
    return null;
  }
}

function normalizeCamera(raw, fallback = { d4: 4, d3: 4, scale: 80 }) {
  if (!raw || typeof raw !== "object") return { ...fallback };
  return {
    d4: Number(raw.d4 ?? fallback.d4),
    d3: Number(raw.d3 ?? fallback.d3),
    scale: Number(raw.scale ?? fallback.scale),
  };
}

function normalizeHyperplanes(list) {
  if (!Array.isArray(list)) return null;
  return list.map((h) => ({
    normal: Array.isArray(h.normal)
      ? vec4(h.normal[0], h.normal[1], h.normal[2], h.normal[3])
      : vec4(h.normal?.x, h.normal?.y, h.normal?.z, h.normal?.w),
    d: Number(h.d ?? 0),
  }));
}

function normalizeRotationPlanes(list) {
  if (!Array.isArray(list)) return null;
  return list.map((r) => ({
    axisA: Array.isArray(r.axisA)
      ? vec4(r.axisA[0], r.axisA[1], r.axisA[2], r.axisA[3])
      : vec4(r.axisA?.x, r.axisA?.y, r.axisA?.z, r.axisA?.w),
    axisB: Array.isArray(r.axisB)
      ? vec4(r.axisB[0], r.axisB[1], r.axisB[2], r.axisB[3])
      : vec4(r.axisB?.x, r.axisB?.y, r.axisB?.z, r.axisB?.w),
    angle: Number(r.angle ?? 0),
    label: String(r.label ?? ""),
  }));
}

/**
 * Resolve scene_push / scene_bind payload into a binding package.
 * Prefer inline mesh (custom / rotated) over meshAssetId; asset id alone is enough for demos.
 *
 * @param {object} msg
 * @param {{ meshesRoot?: string }} [options]
 * @returns {{ ok: true, binding: object } | { ok: false, error: string }}
 */
export function resolveSceneBindMessage(msg, options = {}) {
  if (!msg || typeof msg !== "object") {
    return { ok: false, error: "bad_scene_message" };
  }

  const meshesRoot = options.meshesRoot ?? defaultMeshesRoot();
  let mesh = null;
  let source = "unknown";
  let meshAssetId = typeof msg.meshAssetId === "string" ? msg.meshAssetId : null;

  const inline = normalizeWireMesh(msg.mesh);
  if (inline) {
    mesh = inline;
    source = "unity_mesh";
  } else if (meshAssetId) {
    mesh = loadMeshAsset(meshAssetId, meshesRoot);
    if (!mesh) {
      return { ok: false, error: `unknown_mesh_asset:${meshAssetId}` };
    }
    source = "mesh_asset";
  } else {
    return { ok: false, error: "scene_requires_mesh_or_asset" };
  }

  const sceneId =
    typeof msg.sceneId === "string" && msg.sceneId.length > 0
      ? msg.sceneId
      : source === "mesh_asset"
        ? `asset:${meshAssetId}`
        : "unity_bound";

  const camera = normalizeCamera(msg.camera);
  const hyperplanes = normalizeHyperplanes(msg.hyperplanes);
  const rotationPlanes = normalizeRotationPlanes(msg.rotationPlanes);
  let projectionMatrix = null;
  if (Array.isArray(msg.projectionMatrix) && msg.projectionMatrix.length === 4) {
    projectionMatrix = msg.projectionMatrix.map((row) =>
      Array.isArray(row) ? row.map(Number) : [0, 0, 0, 0],
    );
  }

  const status = {
    id: sceneId,
    source,
    label: `scene: ${sceneId}`,
    meshAssetId,
    vertexCount: mesh.vertices.length,
    faceCount: mesh.faces.length,
    boundAt: Date.now(),
  };

  return {
    ok: true,
    binding: {
      mesh,
      camera,
      projectionMatrix,
      hyperplanes,
      rotationPlanes,
      status,
    },
  };
}

/**
 * Wire ack for successful / failed bind.
 */
export function sceneBoundWire(statusOrError, ok = true) {
  if (!ok) {
    return {
      type: "scene_bound",
      schemaVersion: SCENE_SCHEMA_VERSION,
      ok: false,
      error: typeof statusOrError === "string" ? statusOrError : "bind_failed",
    };
  }
  const s = statusOrError;
  return {
    type: "scene_bound",
    schemaVersion: SCENE_SCHEMA_VERSION,
    ok: true,
    sceneId: s.id,
    source: s.source,
    label: s.label,
    meshAssetId: s.meshAssetId ?? null,
    vertexCount: s.vertexCount,
    faceCount: s.faceCount,
    boundAt: s.boundAt,
  };
}

export function sceneStatusWire(status) {
  const bound = sceneBoundWire(status, true);
  return {
    type: "scene_status",
    schemaVersion: SCENE_SCHEMA_VERSION,
    ok: true,
    sceneId: bound.sceneId,
    source: bound.source,
    label: bound.label,
    meshAssetId: bound.meshAssetId,
    vertexCount: bound.vertexCount,
    faceCount: bound.faceCount,
    boundAt: bound.boundAt,
  };
}
