/**
 * Warrior characterId → Sovereign Sculptor fixture topology.
 *
 * Hybrid (honest, partial):
 * - Energy / RT4D wire remains a projected hull (`mesh.convex_hull` — preview-contract name).
 * - Clay / character body uses locked sculptor fixture GLB/JSON, not the hull as a fox body.
 *
 * Not a production sculpt. Tetrahedron + character-rig/1.0 fixture, or the
 * optional Blender anthro demo GLB if present on disk.
 *
 * Preview contract IDs are consumed from the warrior courtyard fixture /
 * feat/rt4d-preview-contracts FOX_WARRIOR ids. This file does not invent rig/*
 * or region.* names.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { exportSculptGlbBundle } from "./glb.js";
import { createAnthroRig, createFoxQuadrupedRig } from "./rigs.js";
import type { CharacterRigSchema, SculptDocument, Species, Vec3 } from "./types.js";

function resolvePackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(here, ".."), resolve(here, "../..")];
  for (const root of candidates) {
    if (existsSync(join(root, "fixtures", "anthro", "anthro-character-fixture.sculpt.json"))) {
      return root;
    }
  }
  return resolve(here, "..");
}

const PACKAGE_ROOT = resolvePackageRoot();

/** Same IDs as preview-character-continuity.contract.json foxWarriorFixture. */
export const FOX_WARRIOR_PREVIEW_IDS = {
  id: "FOX_WARRIOR_RT4D_FIXTURE",
  productionId: "sf-build-warrior-courtyard-001",
  characterId: "warrior-anthro-fox-01",
  assetIdEnergyHull: "asset.fox-warrior.rt4d-hull.v0",
} as const;

export const WARRIOR_CHARACTER_IDS: ReadonlySet<string> = new Set([
  FOX_WARRIOR_PREVIEW_IDS.characterId,
  "warrior-fox-01",
]);

export const ENERGY_MESH_NAME = "mesh.convex_hull";
export const HYBRID_STATUS = "partial" as const;
export const FIXTURE_SCULPT_STATUS = "core-enforced-fixture-not-production-sculpt" as const;

export function isWarriorCharacterId(characterId: string | undefined | null): boolean {
  return typeof characterId === "string" && WARRIOR_CHARACTER_IDS.has(characterId);
}

export function speciesForWarriorCharacter(characterId: string): Species {
  if (characterId === "warrior-fox-01") return "fox";
  return "anthro";
}

function fixtureDir(species: Species): string {
  return join(PACKAGE_ROOT, "fixtures", species);
}

export function loadFixtureSculptDocument(species: Species): SculptDocument {
  const path = join(fixtureDir(species), `${species}-character-fixture.sculpt.json`);
  const document = JSON.parse(readFileSync(path, "utf8")) as SculptDocument;
  return document;
}

export function rigForSpecies(species: Species): CharacterRigSchema {
  if (species === "fox") return createFoxQuadrupedRig();
  return createAnthroRig();
}

export function blenderAnthroGlbPath(): string {
  return join(PACKAGE_ROOT, "fixtures", "blender-anthro-v1", "anthro-blender-character.glb");
}

export interface WarriorHybridExport {
  readonly statusTag: typeof HYBRID_STATUS;
  readonly productionSculpt: false;
  readonly fixtureStatus: typeof FIXTURE_SCULPT_STATUS;
  readonly characterId: string;
  readonly productionId: string;
  readonly species: Species;
  readonly energy: {
    readonly kind: "convex_hull";
    readonly meshName: typeof ENERGY_MESH_NAME;
    readonly assetId: string;
    readonly role: "energy-field-only";
  };
  readonly character: {
    readonly kind: "sculptor_fixture";
    readonly role: "clay-character";
    readonly sculptDocumentId: string;
    readonly rigId: string;
    readonly rigSchemaVersion: "character-rig/1.0";
    readonly vertexCount: number;
    readonly triangleCount: number;
    readonly topologyNote: string;
    readonly blenderAnthroGlbPresent: boolean;
    readonly blenderAnthroGlbPath: string | null;
  };
  readonly glb: Uint8Array;
  readonly glbSha256: string;
  readonly document: SculptDocument;
  readonly rig: CharacterRigSchema;
  readonly claim: string;
}

export function exportWarriorHybridGlb(
  characterId: string = FOX_WARRIOR_PREVIEW_IDS.characterId,
): WarriorHybridExport {
  if (!isWarriorCharacterId(characterId)) {
    throw new Error(`not a warrior characterId: ${characterId}`);
  }
  const species = speciesForWarriorCharacter(characterId);
  const document = loadFixtureSculptDocument(species);
  const rig = rigForSpecies(species);
  const bundle = exportSculptGlbBundle(document, rig);
  const glbSha256 = createHash("sha256").update(bundle.glb).digest("hex");
  const blenderPath = blenderAnthroGlbPath();
  const blenderPresent = existsSync(blenderPath);

  return {
    statusTag: HYBRID_STATUS,
    productionSculpt: false,
    fixtureStatus: FIXTURE_SCULPT_STATUS,
    characterId,
    productionId: FOX_WARRIOR_PREVIEW_IDS.productionId,
    species,
    energy: {
      kind: "convex_hull",
      meshName: ENERGY_MESH_NAME,
      assetId: FOX_WARRIOR_PREVIEW_IDS.assetIdEnergyHull,
      role: "energy-field-only",
    },
    character: {
      kind: "sculptor_fixture",
      role: "clay-character",
      sculptDocumentId: document.id,
      rigId: rig.id,
      rigSchemaVersion: "character-rig/1.0",
      vertexCount: document.vertices.length,
      triangleCount: document.triangles.length,
      topologyNote:
        "Locked sculptor fixture (not anatomical / not ZBrush). Hull is not used as the body.",
      blenderAnthroGlbPresent: blenderPresent,
      blenderAnthroGlbPath: blenderPresent ? blenderPath : null,
    },
    glb: bundle.glb,
    glbSha256,
    document,
    rig,
    claim:
      "partial / fixture-not-production: warrior clay uses Sovereign Sculptor fixture topology; energy may remain a convex hull. Not a production sculpt.",
  };
}

export function fixtureClayVertices(species: Species): Vec3[] {
  return loadFixtureSculptDocument(species).vertices.map((v) => v.position);
}
