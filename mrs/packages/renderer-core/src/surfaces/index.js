/**
 * Surface registry — parametric 4D surfaces + discrete meshes (tesseract).
 */
import { cliffordTorus } from "./clifford-torus.js";
import { hopfSurface } from "./hopf-surface.js";
import { torus3d } from "./torus-3d.js";
import { trefoil4d } from "./trefoil-4d.js";
import { tesseract } from "./tesseract.js";
import { createHash } from "node:crypto";
import {
  renderIdentityHash,
  deriveGeometryEvidenceId,
  DEFAULT_METRIC_ID,
  DEFAULT_METRIC_VERSION,
} from "../render/rt4d/identity/RenderIdentity.js";

export const surfaces = {
  [cliffordTorus.id]: cliffordTorus,
  [hopfSurface.id]: hopfSurface,
  [torus3d.id]: torus3d,
  [trefoil4d.id]: trefoil4d,
  [tesseract.id]: tesseract,
};

export function getSurface(id) {
  const s = surfaces[id];
  if (!s) {
    const available = Object.keys(surfaces).join(", ");
    throw new Error(`Unknown surface: "${id}". Available: ${available}`);
  }
  console.debug(`[SurfaceDispatch] Resolved surface: ${id} (type: ${s.type ?? 'parametric'})`);
  return s;
}

export function listSurfaces() {
  return Object.values(surfaces).map((s) => ({ id: s.id, name: s.name }));
}

const surfaceMeshCache = new Map();

function hashSurfaceParameters(surface) {
  const params = {
    id: surface.id,
    uRange: surface.uRange,
    vRange: surface.vRange,
    defaultResolution: surface.defaultResolution,
    // Discrete surfaces (tesseract) define sample() instead of parametrize();
    // stringify whichever generator this surface actually uses so their
    // cache identities stay distinct.
    parametrize: surface.parametrize?.toString() ?? surface.sample?.toString() ?? "",
  };
  return createHash("sha256").update(JSON.stringify(params)).digest("hex").slice(0, 16);
}

export function sampleSurface(surface, resolution = null, timeSeconds = 0) {
  const surfaceId = surface.id;
  const res = resolution ?? surface.defaultResolution ?? 64;
  const paramsHash = hashSurfaceParameters(surface);
  // Pre-bake identity: the surface sample is metric-agnostic and precedes the
  // baked geometry buffer, so the geometryHash slot carries the deterministic
  // parametric identity. Keying on renderIdentityHash (not a bare string) keeps
  // every cache in the pipeline uniform (AC-R10 identity invariant).
  const identityKey = renderIdentityHash({
    surfaceId,
    geometryEvidenceId: deriveGeometryEvidenceId({
      surfaceId,
      resolution: res,
      timeSeconds,
      surfaceHash: paramsHash,
      projectionId: "",
    }),
    geometryHash: paramsHash,
    metricId: DEFAULT_METRIC_ID,
    metricVersion: DEFAULT_METRIC_VERSION,
    timeSeconds,
    projectionId: "",
  });

  const cached = surfaceMeshCache.get(identityKey);
  if (cached) {
    console.debug(`[SurfaceDispatch] Cache hit: ${identityKey}`);
    return cached;
  }
  const startTime = Date.now();
  console.debug(`[SurfaceDispatch] Cache miss: ${identityKey}`);
  
  let mesh;
  if (typeof surface.sample === "function") {
    mesh = surface.sample(resolution);
  } else {
    const res = resolution ?? surface.defaultResolution ?? 64;
    const [uMin, uMax] = surface.uRange;
    const [vMin, vMax] = surface.vRange;
    const uStep = (uMax - uMin) / res;
    const vStep = (vMax - vMin) / res;

    const vertices = [];
    const faces = [];
    const edges = new Set();

    // Sample vertices on a grid
    for (let i = 0; i <= res; i++) {
      for (let j = 0; j <= res; j++) {
        const u = uMin + i * ((surface.uRange[1] - surface.uRange[0]) / res);
        const v = vMin + j * ((surface.vRange[1] - surface.vRange[0]) / res);
        vertices.push(surface.parametrize(u, v));
      }
    }

    // Build triangle faces and edges
    const idx = (i, j) => i * (res + 1) + j;

    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        const a = idx(i, j);
        const b = idx(i + 1, j);
        const c = idx(i, j + 1);
        const d = idx(i + 1, j + 1);

        // Two triangles per quad
        faces.push([a, b, c]);
        faces.push([b, d, c]);

        // Edges (deduplicated via Set)
        const addEdge = (edgeSet, a, b) => {
          const key = a < b ? `${a},${b}` : `${b},${a}`;
          edgeSet.add(key);
        };
        addEdge(edges, a, b);
        addEdge(edges, a, c);
        addEdge(edges, b, d);
        addEdge(edges, c, d);
      }
    }

    mesh = {
      vertices,
      faces,
      edges: [...edges].map((s) => {
        const [i, j] = s.split(",").map(Number);
        return [i, j];
      }),
    };
  }

  // Compute geometry hash for constitutional invariant checking
  const geometryHash = computeGeometryHash(mesh);
  const duration = Date.now() - startTime;
  
  const result = {
    ...mesh,
    geometryHash,
    surfaceId: surface.id,
    surfaceHash: geometryHash,
    renderIdentityKey: identityKey,
    geometryEvidenceId: deriveGeometryEvidenceId({
      surfaceId,
      resolution: res,
      timeSeconds,
      surfaceHash: geometryHash,
      projectionId: "",
    }),
  };
  
  surfaceMeshCache.set(identityKey, result);
  
  console.debug(`[SurfaceDispatch] Sampled surface: ${surfaceId}, vertices: ${mesh.vertices?.length ?? 0}, faces: ${mesh.faces?.length ?? 0}, geometryHash: ${geometryHash}, duration: ${duration}ms`);

  return result;
}

function computeGeometryHash(mesh) {
  const vertexData = mesh.vertices?.flatMap(v => [v.x, v.y, v.z, v.w]).join(",") ?? "";
  const faceData = mesh.faces?.flatMap(f => f.join(",")).join(";") ?? "";
  const edgeData = mesh.edges?.map(e => e.join(",")).join(";") ?? "";
  return createHash("sha256").update(`${vertexData}|${faceData}|${edgeData}`).digest("hex");
}

function addEdge(edgeSet, a, b) {
  const key = a < b ? `${a},${b}` : `${b},${a}`;
  edgeSet.add(key);
}