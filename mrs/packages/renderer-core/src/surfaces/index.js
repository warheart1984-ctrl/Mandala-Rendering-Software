/**
 * Surface registry — parametric 4D surfaces + discrete meshes (tesseract).
 */
import { cliffordTorus } from "./clifford-torus.js";
import { hopfSurface } from "./hopf-surface.js";
import { torus3d } from "./torus-3d.js";
import { trefoil4d } from "./trefoil-4d.js";
import { tesseract } from "./tesseract.js";
import { createHash } from "node:crypto";

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

/**
 * Sample a surface into a mesh.
 * Discrete surfaces (e.g. tesseract) use `sample()`; parametric use u/v grid.
 * @param {object} surface - surface definition from getSurface / registry
 * @param {number} resolution - subdivisions per axis (ignored for discrete)
 * @returns {{ vertices: Array<{x,y,z,w}>, faces: Array<[number,number,number]>, edges: Array<[number,number]>, geometryHash: string }}
 */
export function sampleSurface(surface, resolution = null) {
  const surfaceId = surface.id;
  const startTime = Date.now();
  
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
        const u = uMin + i * uStep;
        const v = vMin + j * vStep;
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
  
  console.debug(`[SurfaceDispatch] Sampled surface: ${surfaceId}, vertices: ${mesh.vertices?.length ?? 0}, faces: ${mesh.faces?.length ?? 0}, geometryHash: ${geometryHash}, duration: ${duration}ms`);

  return {
    ...mesh,
    geometryHash,
    surfaceId,
  };
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