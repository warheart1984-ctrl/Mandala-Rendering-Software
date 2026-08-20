/**
 * RT4D → Rig Bridge
 *
 * Converts RT4D WireMesh4D (4D vertices + edges) into a SculptDocument
 * that can be exported as GLB via sovereign-sculptor.
 *
 * Pipeline: 4D vertices → perspective projection → 3D convex hull → SculptDocument → GLB
 *
 * The hull is an energy-field surface. It is not warrior/fox body topology.
 * characterId warrior-anthro-fox-01 uses warrior-fixture-hybrid.ts (sculptor fixture).
 */

import { createHash } from "node:crypto";
import type {
  CharacterRigSchema,
  Mat4Tuple,
  SculptDocument,
  SculptVertex,
  SculptTriangle,
  SculptRegion,
  Vec3,
} from "./types.js";
import { exportSculptDocumentToGlb } from "./glb.js";

/** WireMesh4D shape matching rt4d-chatgpt-plugin schema */
interface WireMesh4D {
  readonly schemaVersion: string;
  readonly vertices: ReadonlyArray<readonly [number, number, number, number]>;
  readonly edges: ReadonlyArray<readonly [number, number]>;
  readonly vertexCount: number;
  readonly edgeCount: number;
  readonly meshSha256: string;
}

interface BridgeMesh3D {
  readonly positions: Vec3[];
  readonly indices: [number, number, number][];
  readonly regions: string[];
}

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/** Perspective project 4D → 3D (same as wire-mesh-4d.ts but standalone) */
function project4Dto3D(
  vertices: ReadonlyArray<readonly [number, number, number, number]>,
  distance4d: number
): Vec3[] {
  const d4 = distance4d === 0 ? 4 : distance4d;
  return vertices.map(([x, y, z, w]) => {
    const k = d4 / (d4 - w);
    return [x * k, y * k, z * k] as Vec3;
  });
}

/**
 * Build a triangle mesh from 3D points + edges.
 * Uses edge-adjacency to build triangle faces from the wireframe structure.
 * For convex shapes this produces a clean hull; for energy fields it produces
 * a triangulated surface suitable for rigging.
 */
function buildMeshFromEdges(
  positions: Vec3[],
  edges: ReadonlyArray<readonly [number, number]>
): BridgeMesh3D {
  const triangles: [number, number, number][] = [];
  const regions: string[] = [];

  // Build adjacency: for each edge, find shared vertices to form triangles
  const adjacency = new Map<number, Set<number>>();
  for (const [a, b] of edges) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }

  // Find triangles: for each edge (a,b), find common neighbors c
  const triangleSet = new Set<string>();
  for (const [a, b] of edges) {
    const neighborsA = adjacency.get(a);
    const neighborsB = adjacency.get(b);
    if (!neighborsA || !neighborsB) continue;

    for (const c of neighborsA) {
      if (c === b) continue;
      if (neighborsB.has(c)) {
        // Canonical triangle key (sorted)
        const sorted = [a, b, c].sort((x, y) => x - y);
        const key = sorted.join(",");
        if (!triangleSet.has(key)) {
          triangleSet.add(key);
          triangles.push([sorted[0], sorted[1], sorted[2]]);
          regions.push("whole-body");
        }
      }
    }
  }

  // If no triangles found from edge adjacency, do convex hull fallback
  if (triangles.length === 0 && positions.length >= 4) {
    const hull = convexHull3D(positions);
    for (const tri of hull) {
      triangles.push(tri);
      regions.push("whole-body");
    }
  }

  return { positions, indices: triangles, regions };
}

/** Simple 3D convex hull using incremental algorithm */
function convexHull3D(points: Vec3[]): [number, number, number][] {
  if (points.length < 4) return [];

  // Find initial tetrahedron
  let p0 = 0, p1 = 1, p2 = -1, p3 = -1;

  // Find p2: not collinear with p0-p1
  for (let i = 2; i < points.length; i++) {
    const ab = [
      points[p1][0] - points[p0][0],
      points[p1][1] - points[p0][1],
      points[p1][2] - points[p0][2],
    ];
    const ac = [
      points[i][0] - points[p0][0],
      points[i][1] - points[p0][1],
      points[i][2] - points[p0][2],
    ];
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    if (Math.hypot(cross[0], cross[1], cross[2]) > 1e-10) {
      p2 = i;
      break;
    }
  }
  if (p2 === -1) return [];

  // Find p3: not coplanar with p0-p1-p2
  const ab = [
    points[p1][0] - points[p0][0],
    points[p1][1] - points[p0][1],
    points[p1][2] - points[p0][2],
  ];
  const ac = [
    points[p2][0] - points[p0][0],
    points[p2][1] - points[p0][1],
    points[p2][2] - points[p0][2],
  ];
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];

  for (let i = 0; i < points.length; i++) {
    if (i === p0 || i === p1 || i === p2) continue;
    const ad = [
      points[i][0] - points[p0][0],
      points[i][1] - points[p0][1],
      points[i][2] - points[p0][2],
    ];
    const dot = normal[0] * ad[0] + normal[1] * ad[1] + normal[2] * ad[2];
    if (Math.abs(dot) > 1e-10) {
      p3 = i;
      break;
    }
  }
  if (p3 === -1) return [];

  // Ensure consistent winding for the tetrahedron faces
  const faces: [number, number, number][] = [
    [p0, p1, p2],
    [p0, p2, p3],
    [p0, p3, p1],
    [p1, p3, p2],
  ];

  // Orient faces outward
  for (const face of faces) {
    const [a, b, c] = face;
    const ab2 = [points[b][0]-points[a][0], points[b][1]-points[a][1], points[b][2]-points[a][2]];
    const ac2 = [points[c][0]-points[a][0], points[c][1]-points[a][1], points[c][2]-points[a][2]];
    const n = [
      ab2[1]*ac2[2]-ab2[2]*ac2[1],
      ab2[2]*ac2[0]-ab2[0]*ac2[2],
      ab2[0]*ac2[1]-ab2[1]*ac2[0],
    ];
    // The fourth point should be on the negative side
    const fourth = face === faces[0] ? p3 : face === faces[1] ? p1 : face === faces[2] ? p2 : p0;
    const ad = [points[fourth][0]-points[a][0], points[fourth][1]-points[a][1], points[fourth][2]-points[a][2]];
    if (n[0]*ad[0]+n[1]*ad[1]+n[2]*ad[2] > 0) {
      // Flip winding
      face[1] = c;
      face[2] = b;
    }
  }

  // Incremental hull: add remaining points
  const used = new Set([p0, p1, p2, p3]);
  const allFaces = [...faces];

  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue;

    const visible: number[] = [];
    for (let fi = 0; fi < allFaces.length; fi++) {
      const [a, b, c] = allFaces[fi];
      const ab2 = [points[b][0]-points[a][0], points[b][1]-points[a][1], points[b][2]-points[a][2]];
      const ac2 = [points[c][0]-points[a][0], points[c][1]-points[a][1], points[c][2]-points[a][2]];
      const n = [
        ab2[1]*ac2[2]-ab2[2]*ac2[1],
        ab2[2]*ac2[0]-ab2[0]*ac2[2],
        ab2[0]*ac2[1]-ab2[1]*ac2[0],
      ];
      const ad = [points[i][0]-points[a][0], points[i][1]-points[a][1], points[i][2]-points[a][2]];
      if (n[0]*ad[0]+n[1]*ad[1]+n[2]*ad[2] > 1e-10) {
        visible.push(fi);
      }
    }

    if (visible.length === 0) {
      used.add(i);
      continue;
    }

    // Find horizon edges
    const horizonEdges: [number, number][] = [];
    const visibleSet = new Set(visible);
    for (const fi of visible) {
      const [a, b, c] = allFaces[fi];
      for (const [u, v] of [[a,b],[b,c],[c,a]]) {
        // Check if the neighboring face across this edge is NOT visible
        let neighborVisible = false;
        for (const fj of visible) {
          if (fj === fi) continue;
          const [x, y, z] = allFaces[fj];
          if ((u===x&&v===y)||(u===y&&v===x)||(u===y&&v===z)||(u===z&&v===y)||(u===z&&v===x)||(u===x&&v===z)) {
            neighborVisible = true;
            break;
          }
        }
        if (!neighborVisible) {
          horizonEdges.push([u, v]);
        }
      }
    }

    // Remove visible faces (in reverse order to keep indices valid)
    for (let j = visible.length - 1; j >= 0; j--) {
      allFaces.splice(visible[j], 1);
    }

    // Add new faces from horizon edges to the new point
    for (const [u, v] of horizonEdges) {
      allFaces.push([i, u, v]);
    }

    used.add(i);
  }

  return allFaces;
}

/** Create a default fox rig for RT4D export */
function createDefaultFoxRig(): CharacterRigSchema {
  const identity = (): Mat4Tuple => {
    return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] as Mat4Tuple;
  };

  return {
    schemaVersion: "character-rig/1.0",
    status: "core-enforced-fixture-not-production-rig",
    id: "rt4d-fox-rig-fixture",
    species: "fox",
    bones: [
      { id: "root", parentId: null, bindTransform: identity(), constraint: { rotationRadians: { min: [-1,-1,-1], max: [1,1,1] }, translationLocked: false, scaleLocked: false } },
      { id: "pelvis", parentId: "root", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.5,-0.3,-0.5], max: [0.5,0.3,0.5] }, translationLocked: true, scaleLocked: true } },
      { id: "spine", parentId: "pelvis", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.4,-0.2,-0.3], max: [0.4,0.2,0.3] }, translationLocked: true, scaleLocked: true } },
      { id: "chest", parentId: "spine", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.3,-0.2,-0.3], max: [0.3,0.2,0.3] }, translationLocked: true, scaleLocked: true } },
      { id: "neck", parentId: "chest", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.6,-0.8,-0.4], max: [0.6,0.8,0.4] }, translationLocked: true, scaleLocked: true } },
      { id: "head", parentId: "neck", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.5,-1,-0.4], max: [0.5,1,0.4] }, translationLocked: true, scaleLocked: true } },
      { id: "jaw", parentId: "head", bindTransform: identity(), constraint: { rotationRadians: { min: [0,-0.2,0], max: [0.5,0.2,0] }, translationLocked: true, scaleLocked: true } },
      { id: "eye_L", parentId: "head", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.1,-0.3,-0.1], max: [0.1,0.3,0.1] }, translationLocked: true, scaleLocked: true } },
      { id: "eye_R", parentId: "head", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.1,-0.3,-0.1], max: [0.1,0.3,0.1] }, translationLocked: true, scaleLocked: true } },
      { id: "ear_L", parentId: "head", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.3,-0.5,-0.2], max: [0.3,0.5,0.2] }, translationLocked: true, scaleLocked: true } },
      { id: "ear_R", parentId: "head", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.3,-0.5,-0.2], max: [0.3,0.5,0.2] }, translationLocked: true, scaleLocked: true } },
      { id: "shoulder_L", parentId: "chest", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.8,-0.5,-1], max: [0.8,0.5,1] }, translationLocked: true, scaleLocked: true } },
      { id: "arm_L", parentId: "shoulder_L", bindTransform: identity(), constraint: { rotationRadians: { min: [-1.2,-0.3,-0.3], max: [0.2,0.3,0.3] }, translationLocked: true, scaleLocked: true } },
      { id: "paw_L", parentId: "arm_L", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.5,-0.2,-0.2], max: [0.5,0.2,0.2] }, translationLocked: true, scaleLocked: true } },
      { id: "shoulder_R", parentId: "chest", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.8,-0.5,-1], max: [0.8,0.5,1] }, translationLocked: true, scaleLocked: true } },
      { id: "arm_R", parentId: "shoulder_R", bindTransform: identity(), constraint: { rotationRadians: { min: [-1.2,-0.3,-0.3], max: [0.2,0.3,0.3] }, translationLocked: true, scaleLocked: true } },
      { id: "paw_R", parentId: "arm_R", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.5,-0.2,-0.2], max: [0.5,0.2,0.2] }, translationLocked: true, scaleLocked: true } },
      { id: "leg_L", parentId: "pelvis", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.8,-0.3,-0.3], max: [0.3,0.3,0.3] }, translationLocked: true, scaleLocked: true } },
      { id: "foot_L", parentId: "leg_L", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.5,-0.2,-0.2], max: [0.8,0.2,0.2] }, translationLocked: true, scaleLocked: true } },
      { id: "leg_R", parentId: "pelvis", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.8,-0.3,-0.3], max: [0.3,0.3,0.3] }, translationLocked: true, scaleLocked: true } },
      { id: "foot_R", parentId: "leg_R", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.5,-0.2,-0.2], max: [0.8,0.2,0.2] }, translationLocked: true, scaleLocked: true } },
      { id: "tail", parentId: "pelvis", bindTransform: identity(), constraint: { rotationRadians: { min: [-0.8,-0.8,-0.8], max: [0.8,0.8,0.8] }, translationLocked: true, scaleLocked: true } },
    ],
    blendshapes: [
      { id: "blink_L", regionId: "face", minWeight: 0, maxWeight: 1, symmetricPartnerId: "blink_R" },
      { id: "blink_R", regionId: "face", minWeight: 0, maxWeight: 1, symmetricPartnerId: "blink_L" },
      { id: "smile", regionId: "face", minWeight: 0, maxWeight: 1 },
      { id: "frown", regionId: "face", minWeight: 0, maxWeight: 1 },
      { id: "ear_up_L", regionId: "ear_L", minWeight: 0, maxWeight: 1 },
      { id: "ear_up_R", regionId: "ear_R", minWeight: 0, maxWeight: 1 },
    ],
    capabilities: { face: true, body: true, tail: true, ears: true, digitigrade: true, hands: false, paws: true },
  };
}

/**
 * Convert a WireMesh4D to a SculptDocument suitable for GLB export.
 *
 * Steps:
 * 1. Project 4D vertices → 3D via perspective projection
 * 2. Build triangle mesh from edges (or convex hull fallback)
 * 3. Wrap in SculptDocument with locked topology
 */
export function wireMesh4DToSculptDocument(
  mesh: WireMesh4D,
  distance4d: number,
  characterId: string,
  species: "fox" | "anthro" | "human" = "fox"
): SculptDocument {
  // Step 1: Project 4D → 3D
  const positions3d = project4Dto3D(mesh.vertices, distance4d);

  // Step 2: Build triangle mesh from edges
  const bridgeMesh = buildMeshFromEdges(positions3d, mesh.edges);

  // If no triangles, create a minimal bounding shape
  if (bridgeMesh.indices.length === 0) {
    // Create a simple tetrahedron from the first 4 points
    if (positions3d.length >= 4) {
      bridgeMesh.indices.push([0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]);
      bridgeMesh.regions.push("whole-body", "whole-body", "whole-body", "whole-body");
    }
  }

  // Step 3: Build SculptDocument
  const vertices: SculptVertex[] = bridgeMesh.positions.map((pos, i) => ({
    id: `${characterId}:v${i}`,
    position: pos,
  }));

  const triangles: SculptTriangle[] = bridgeMesh.indices.map(([a, b, c], i) => ({
    id: `${characterId}:t${i}`,
    vertexIndices: [a, b, c],
    regionId: bridgeMesh.regions[i] ?? "whole-body",
  }));

  const regionVertexIndices = new Map<string, number[]>();
  for (let i = 0; i < vertices.length; i++) {
    const region = bridgeMesh.regions[i] ?? "whole-body";
    if (!regionVertexIndices.has(region)) regionVertexIndices.set(region, []);
    regionVertexIndices.get(region)!.push(i);
  }
  const regions: SculptRegion[] = Array.from(regionVertexIndices.entries()).map(([id, indices]) => ({
    id,
    vertexIndices: indices,
  }));

  return {
    schemaVersion: "sovereign-sculpt/1.0",
    status: "core-enforced-fixture-not-production-sculpt",
    id: characterId,
    species,
    topologyState: "locked",
    topologyRevision: 1,
    identity: {
      id: characterId,
      displayName: `RT4D ${species} character`,
      gender: { identity: "unspecified", attribution: "creator-authored" },
    },
    morphologyProfile: {
      stature: 0.5,
      bodyMass: 0.5,
      limbLength: 0.5,
      torsoLength: 0.5,
      headScale: 0.5,
      muzzleLength: species === "fox" ? 0.6 : 0.3,
      earScale: species === "fox" ? 0.7 : 0.4,
      tailLength: species === "fox" ? 0.8 : 0.2,
      digitigradeBias: species === "fox" ? 0.9 : 0.3,
    },
    vertices,
    triangles,
    regions,
    masks: [],
    operationLog: [],
  };
}

/**
 * Full pipeline: WireMesh4D → GLB.
 * Returns the GLB bytes, the SculptDocument, and the rig used.
 */
export function wireMesh4DToGLB(
  mesh: WireMesh4D,
  distance4d: number,
  characterId: string,
  species: "fox" | "anthro" | "human" = "fox",
  rig?: CharacterRigSchema
): { glb: Uint8Array; document: SculptDocument; rig: CharacterRigSchema } {
  const document = wireMesh4DToSculptDocument(mesh, distance4d, characterId, species);
  const usedRig = rig ?? createDefaultFoxRig();

  // Ensure species match
  if (document.species !== usedRig.species) {
    throw new Error(`species mismatch: document is ${document.species}, rig is ${usedRig.species}`);
  }

  const glb = exportSculptDocumentToGlb(document, usedRig);
  return { glb, document, rig: usedRig };
}
