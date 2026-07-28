/**
 * Engine3DWorldDocument → RT4D capsule / sphere descriptors with material roles.
 *
 * Drive-G-1: capsules for tube-like primitives; spheres for joints/cores;
 * materials mapped via materialToRt4dEntry / lattice role ids when present.
 * Star worlds prefer true 4D arm endpoints from worldDocumentToRt4dStar.
 *
 * Status: **enforced** by unit tests for mandala lattice + 4D star worlds.
 */

import type {
  Engine3DWorldDocument,
  Transform,
  UniversalMaterial,
} from "../world/WorldObject.js";
import { materialToRt4dEntry, type Rt4dMaterialEntry } from "../world/MaterialSystem.js";
import { createDefaultMaterialCatalog } from "../renderer/raster/RasterMaterial.js";
import { hashCanonical } from "./hash.js";
import {
  decomposeRt4dStar,
  worldDocumentToRt4dStar,
  type Rt4dStarDescriptor,
} from "../world/StarWorld.js";
import { MATERIAL_CATALOG_VERSION } from "../materials/StarMaterials.js";
import { starMaterialCatalog } from "../materials/StarMaterials.js";

export type WorldRt4dPrimitiveProvenance = {
  readonly originNode: string;
  readonly materialId: string;
  readonly generatorSeed: number;
  readonly integrityHash: string;
  readonly catalogVersion: string;
  /** Spec role per E3D-RT4D-3 (glass_capsule / metal_capsule / emissive_capsule). */
  readonly specRole: string;
};

export type WorldRt4dPrimitive =
  | {
      kind: "oriented-capsule";
      id: string;
      a: readonly [number, number, number, number];
      b: readonly [number, number, number, number];
      radius: number;
      materialId: string;
      materialRole: string;
      rt4dMaterial: Rt4dMaterialEntry;
      provenance: WorldRt4dPrimitiveProvenance;
    }
  | {
      kind: "hypersphere";
      id: string;
      center: readonly [number, number, number, number];
      radius: number;
      materialId: string;
      materialRole: string;
      rt4dMaterial: Rt4dMaterialEntry;
      provenance: WorldRt4dPrimitiveProvenance;
    };

function matLookup(materials: readonly UniversalMaterial[]): Map<string, UniversalMaterial> {
  const map = new Map<string, UniversalMaterial>();
  for (const m of materials) map.set(m.id, m);
  for (const m of createDefaultMaterialCatalog()) {
    if (!map.has(m.id)) map.set(m.id, m);
    if (!map.has(m.type)) map.set(m.type, m);
  }
  for (const m of starMaterialCatalog()) {
    if (!map.has(m.id)) map.set(m.id, m);
  }
  return map;
}

/** PathTracer lattice role (glass_tube / chrome_joint / core_glow). */
function roleForMaterialId(id: string, type: string): string {
  if (id === "um_star_arm" || id === "glass_tube" || type === "glass" || type === "energy-lattice") {
    return "glass_tube";
  }
  if (id === "chrome_joint" || type === "metal") return "chrome_joint";
  if (
    id === "um_star_core" ||
    id === "um_star_halo" ||
    id === "core_glow" ||
    type === "emissive" ||
    type === "mandala-core" ||
    type === "neon-grid"
  ) {
    return "core_glow";
  }
  return id || type || "surf";
}

/** E3D-RT4D-3 spec role naming. */
function specRoleForMaterialId(id: string, type: string): string {
  if (id === "glass_tube" || id === "um_star_arm" || type === "glass" || type === "energy-lattice") {
    return "glass_capsule";
  }
  if (id === "chrome_joint" || type === "metal") return "metal_capsule";
  if (
    id === "core_glow" ||
    id === "um_star_core" ||
    id === "um_star_halo" ||
    type === "emissive" ||
    type === "mandala-core"
  ) {
    return "emissive_capsule";
  }
  return id || type || "surf";
}

function worldIntegrityHash(world: Engine3DWorldDocument): string {
  return `sha256:${hashCanonical({
    id: world.id,
    seed: world.generator?.seed ?? 0,
    objects: (world.objects ?? []).map((o) => ({
      id: o.id,
      prim: o.geometry?.primitiveType,
      mid: o.material?.materialId,
      t: o.transform,
    })),
    catalogVersion: MATERIAL_CATALOG_VERSION,
  }).slice(0, 32)}`;
}

function provenanceFor(
  world: Engine3DWorldDocument,
  originNode: string,
  materialId: string,
  type: string,
): WorldRt4dPrimitiveProvenance {
  return {
    originNode,
    materialId,
    generatorSeed: world.generator?.seed ?? 0,
    integrityHash: worldIntegrityHash(world),
    catalogVersion: MATERIAL_CATALOG_VERSION,
    specRole: specRoleForMaterialId(materialId, type),
  };
}

/** Capsule axis from transform: local +Y scaled, endpoints in world xyz (w=0). */
function capsuleEndpoints(transform: Transform): {
  a: readonly [number, number, number, number];
  b: readonly [number, number, number, number];
  radius: number;
} {
  const [px, py, pz] = transform.position;
  const [sx, sy, sz] = transform.scale;
  const half = Math.max(1e-4, Math.abs(sy));
  let ax = 0;
  let ay = 1;
  let az = 0;
  if (transform.rotation.length === 3) {
    const rx = transform.rotation[0]!;
    const ry = transform.rotation[1]!;
    const rz = transform.rotation[2]!;
    const cx = Math.cos(rx), sxr = Math.sin(rx);
    const cy = Math.cos(ry), syr = Math.sin(ry);
    const cz = Math.cos(rz), szr = Math.sin(rz);
    let x = 0;
    let y = cx;
    let z = sxr;
    const x2 = x * cy + z * syr;
    const y2 = y;
    const z2 = -x * syr + z * cy;
    ax = x2 * cz - y2 * szr;
    ay = x2 * szr + y2 * cz;
    az = z2;
  }
  const len = Math.hypot(ax, ay, az) || 1;
  ax /= len;
  ay /= len;
  az /= len;
  const a: [number, number, number, number] = [
    px - ax * half,
    py - ay * half,
    pz - az * half,
    0,
  ];
  const b: [number, number, number, number] = [
    px + ax * half,
    py + ay * half,
    pz + az * half,
    0,
  ];
  const radius = Math.max(1e-4, 0.5 * Math.min(Math.abs(sx), Math.abs(sz)));
  return { a, b, radius };
}

function sphereFromTransform(transform: Transform): {
  center: readonly [number, number, number, number];
  radius: number;
} {
  const [px, py, pz] = transform.position;
  const r = 0.5 * Math.max(transform.scale[0], transform.scale[1], transform.scale[2]);
  return { center: [px, py, pz, 0], radius: Math.max(1e-4, r) };
}

function primitivesFromStar(
  world: Engine3DWorldDocument,
  star: Rt4dStarDescriptor,
  mats: Map<string, UniversalMaterial>,
): WorldRt4dPrimitive[] {
  const out: WorldRt4dPrimitive[] = [];
  for (const p of decomposeRt4dStar(star)) {
    const uni = mats.get(p.materialId) ?? mats.get("basic")!;
    const entry = materialToRt4dEntry(uni);
    const role = roleForMaterialId(uni.id, uni.type);
    const prov = provenanceFor(world, p.originNode, uni.id, uni.type);
    if (p.kind === "oriented-capsule") {
      out.push({
        kind: "oriented-capsule",
        id: p.id,
        a: p.a!,
        b: p.b!,
        radius: p.radius,
        materialId: uni.id,
        materialRole: role,
        rt4dMaterial: entry,
        provenance: { ...prov, integrityHash: p.integrityHash },
      });
    } else {
      out.push({
        kind: "hypersphere",
        id: p.id,
        center: p.center!,
        radius: p.radius,
        materialId: uni.id,
        materialRole: role,
        rt4dMaterial: entry,
        provenance: { ...prov, integrityHash: p.integrityHash },
      });
    }
  }
  return out;
}

/**
 * Convert world document geometry into RT4D-oriented primitives.
 * Capsule/cylinder/torus chords → oriented-capsule; spheres/icospheres → hypersphere.
 * Star worlds → true 4D arm endpoints via Rt4dStar decomposition (BR-STAR-1/3).
 */
export function worldDocumentToRt4dPrimitives(
  world: Engine3DWorldDocument,
): WorldRt4dPrimitive[] {
  const mats = matLookup(world.materials ?? []);
  const star = worldDocumentToRt4dStar(world);
  if (star && (world.generator?.type === "star" || world.objects.some((o) => o.id === "star-core"))) {
    return primitivesFromStar(world, star, mats);
  }

  const out: WorldRt4dPrimitive[] = [];
  for (const obj of world.objects ?? []) {
    if (obj.kind === "camera" || obj.kind === "light") continue;
    if (!obj.geometry?.primitiveType) continue;
    const mid = obj.material?.materialId ?? "basic";
    const uni = mats.get(mid) ?? mats.get("basic")!;
    const entry = materialToRt4dEntry(uni);
    const role = roleForMaterialId(uni.id, uni.type);
    const prim = obj.geometry.primitiveType;
    const prov = provenanceFor(world, obj.id, uni.id, uni.type);

    if (prim === "capsule" || prim === "cylinder") {
      const { a, b, radius } = capsuleEndpoints(obj.transform);
      out.push({
        kind: "oriented-capsule",
        id: obj.id,
        a,
        b,
        radius,
        materialId: uni.id,
        materialRole: role,
        rt4dMaterial: entry,
        provenance: prov,
      });
      continue;
    }

    if (prim === "torus") {
      const [px, py, pz] = obj.transform.position;
      const R = Math.max(obj.transform.scale[0], obj.transform.scale[1]) * 0.7;
      const tube = Math.max(1e-4, Math.abs(obj.transform.scale[2]) * 0.5);
      const segs = 12;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        out.push({
          kind: "oriented-capsule",
          id: `${obj.id}:chord:${i}`,
          a: [px + Math.cos(a0) * R, py, pz + Math.sin(a0) * R, 0],
          b: [px + Math.cos(a1) * R, py, pz + Math.sin(a1) * R, 0],
          radius: tube,
          materialId: uni.id,
          materialRole: role,
          rt4dMaterial: entry,
          provenance: { ...prov, originNode: `${obj.id}:chord:${i}` },
        });
      }
      continue;
    }

    const { center, radius } = sphereFromTransform(obj.transform);
    out.push({
      kind: "hypersphere",
      id: obj.id,
      center,
      radius: prim === "box" || prim === "pyramid" ? radius * 1.1 : radius,
      materialId: uni.id,
      materialRole: role,
      rt4dMaterial: entry,
      provenance: prov,
    });
  }

  return out;
}

export function worldDocumentRt4dMaterialTable(
  world: Engine3DWorldDocument,
): Rt4dMaterialEntry[] {
  const seen = new Map<string, Rt4dMaterialEntry>();
  for (const p of worldDocumentToRt4dPrimitives(world)) {
    seen.set(p.rt4dMaterial.id, p.rt4dMaterial);
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Composite rt4d_star when world is a star world; null otherwise. */
export function worldDocumentToRt4dStarBridge(
  world: Engine3DWorldDocument,
): Rt4dStarDescriptor | null {
  return worldDocumentToRt4dStar(world);
}

/** BridgePrimitive list for SceneBridge / Rt4dAdapter (capsules included). */
export function worldDocumentToBridgePrimitives(
  world: Engine3DWorldDocument,
): import("./types.js").BridgePrimitive[] {
  return worldDocumentToRt4dPrimitives(world).map((p) => {
    if (p.kind === "oriented-capsule") {
      const mid: [number, number, number, number] = [
        (p.a[0] + p.b[0]) * 0.5,
        (p.a[1] + p.b[1]) * 0.5,
        (p.a[2] + p.b[2]) * 0.5,
        (p.a[3] + p.b[3]) * 0.5,
      ];
      return {
        kind: "oriented_capsule" as const,
        id: p.id,
        center: mid,
        radius: p.radius,
        source: "world_document" as const,
        sourceId: p.provenance.originNode,
        materialHint: p.materialRole,
        capsule: { a: p.a, b: p.b },
        provenance: {
          generatorSeed: p.provenance.generatorSeed,
          integrityHash: p.provenance.integrityHash,
          catalogVersion: p.provenance.catalogVersion,
          specRole: p.provenance.specRole,
        },
      };
    }
    return {
      kind: "hypersphere" as const,
      id: p.id,
      center: p.center,
      radius: p.radius,
      source: "world_document" as const,
      sourceId: p.provenance.originNode,
      materialHint: p.materialRole,
      provenance: {
        generatorSeed: p.provenance.generatorSeed,
        integrityHash: p.provenance.integrityHash,
        catalogVersion: p.provenance.catalogVersion,
        specRole: p.provenance.specRole,
      },
    };
  });
}
