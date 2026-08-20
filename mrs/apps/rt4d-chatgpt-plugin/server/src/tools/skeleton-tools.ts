import { createHash } from "node:crypto";
import { z } from "zod";
import { getSceneOrThrow } from "../scene-store.js";
import { projectWireMeshTo3d, buildEnergyWireMesh4d } from "../wire-mesh-4d.js";
import {
  encodeProjectedMeshToGlb,
  GLB_FIXTURE_STATUS,
  GLB_MESH_NAME,
  POSE_BONE_IDS,
} from "../encode-glb.js";
import {
  FOX_WARRIOR_PREVIEW_IDS,
  exportWarriorHybridGlb,
  isWarriorCharacterId,
} from "../../../../../packages/sovereign-sculptor/src/warrior-fixture-hybrid.js";

/**
 * RT4D → GLB bridge.
 * We inline the critical functions here to avoid cross-package import issues
 * in the MCP server context. The logic matches sovereign-sculptor/src/rt4d-to-rig-bridge.ts.
 */

type Vec3 = [number, number, number];
type Vec4 = [number, number, number, number];

function project4Dto3D(vertices: Vec4[], d4: number): Vec3[] {
  const dist = d4 === 0 ? 4 : d4;
  return vertices.map(([x, y, z, w]) => {
    const k = dist / (dist - w);
    return [x * k, y * k, z * k] as Vec3;
  });
}

function buildMeshFromEdges(
  positions: Vec3[],
  edges: ReadonlyArray<readonly [number, number]>
): { positions: Vec3[]; indices: [number, number, number][] } {
  const adjacency = new Map<number, Set<number>>();
  for (const [a, b] of edges) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }

  const triangles: [number, number, number][] = [];
  const triangleSet = new Set<string>();

  for (const [a, b] of edges) {
    const neighborsA = adjacency.get(a);
    const neighborsB = adjacency.get(b);
    if (!neighborsA || !neighborsB) continue;
    for (const c of neighborsA) {
      if (c === b) continue;
      if (neighborsB.has(c)) {
        const sorted = [a, b, c].sort((x, y) => x - y);
        const key = sorted.join(",");
        if (!triangleSet.has(key)) {
          triangleSet.add(key);
          triangles.push([sorted[0], sorted[1], sorted[2]]);
        }
      }
    }
  }

  return { positions, indices: triangles };
}

interface SculptVertex { id: string; position: Vec3 }
interface SculptTriangle { id: string; vertexIndices: [number, number, number]; regionId: string }

function wireMeshToSculptDocument(
  positions3d: Vec3[],
  edges: ReadonlyArray<readonly [number, number]>,
  characterId: string,
  species: string
) {
  const mesh = buildMeshFromEdges(positions3d, edges);
  const vertices: SculptVertex[] = mesh.positions.map((pos, i) => ({
    id: `${characterId}:v${i}`,
    position: pos,
  }));
  const triangles: SculptTriangle[] = mesh.indices.map(([a, b, c], i) => ({
    id: `${characterId}:t${i}`,
    vertexIndices: [a, b, c],
    regionId: "whole-body",
  }));
  return { vertices, triangles };
}

/** Declared / skeleton tools — clear NotImplemented envelopes. */

export const exportRt4dAssetInputShape = {
  sceneId: z.string().min(1),
  format: z.enum(["png", "json", "glb", "unity", "unreal"]).optional(),
  species: z.enum(["fox", "anthro", "human"]).optional(),
  distance4d: z.number().optional(),
  characterId: z.string().min(1).optional(),
  productionId: z.string().min(1).optional(),
  assetId: z.string().min(1).optional(),
};

export const validateCharacterContinuityInputShape = {
  sceneId: z.string().min(1),
  againstSceneId: z.string().optional(),
};

export const replayAnimeShotInputShape = {
  sceneId: z.string().min(1),
  shotId: z.string().optional(),
};

export const compareRenderVersionsInputShape = {
  sceneIdA: z.string().min(1),
  sceneIdB: z.string().min(1),
};

export const approveCanonicalShotInputShape = {
  sceneId: z.string().min(1),
  decision: z.string().optional(),
};

function declaredStub(tool: string, note: string) {
  return {
    statusTag: "declared" as const,
    implemented: false,
    error: "NotImplemented",
    tool,
    note,
    architectureSoT:
      "docs/anime-lane/RT4D_ANIME_LANE_DEFENSIBLE_ARCHITECTURE.v1.md",
  };
}

export function handleExportRt4dAsset(args: unknown) {
  const parsed = z.object(exportRt4dAssetInputShape).parse(args ?? {});
  const format = parsed.format ?? "glb";

  if (format === "unity" || format === "unreal") {
    return declaredStub(
      "export_rt4d_asset",
      `${format} game-pack export is declared — GLB fixture hull only (partial).`
    );
  }

  try {
    const scene = getSceneOrThrow(parsed.sceneId);

    // Get the wire mesh from the scene (or build a fresh one)
    let wireMesh;
    if (scene.characterPipeline?.wireMesh) {
      wireMesh = scene.characterPipeline.wireMesh;
    } else {
      wireMesh = buildEnergyWireMesh4d({
        sceneSeedHex: scene.sceneId,
      });
    }

    const distance4d = parsed.distance4d ?? scene.projection.distance4d ?? 4;
    const species = parsed.species ?? "fox";
    const requestedCharacterId = parsed.characterId;
    const characterId =
      requestedCharacterId ?? `rt4d-export-${scene.sceneId.slice(0, 12)}`;

    // Project 4D → 3D (convert readonly to mutable)
    const positions3d: Vec3[] = projectWireMeshTo3d(wireMesh, distance4d).map(
      (p) => [p[0], p[1], p[2]] as Vec3
    );

    // Build mesh from edges
    const mesh = buildMeshFromEdges(positions3d, wireMesh.edges);

    if (format === "json") {
      return {
        statusTag: "partial" as const,
        implemented: true,
        tool: "export_rt4d_asset",
        format: "json",
        characterId,
        species,
        vertexCount: mesh.positions.length,
        triangleCount: mesh.indices.length,
        meshSha256: wireMesh.meshSha256,
        note: "JSON mesh data — not a renderable asset file.",
        positions3d: mesh.positions,
        triangles: mesh.indices,
      };
    }

    if (format === "png") {
      return {
        statusTag: "partial" as const,
        implemented: true,
        tool: "export_rt4d_asset",
        format: "png",
        characterId,
        note: "PNG render of wireframe — use render_stage for controlled output.",
      };
    }

    // GLB: warrior characterId uses sculptor fixture (clay). Energy hull stays named mesh.convex_hull.
    if (isWarriorCharacterId(characterId) || characterId === FOX_WARRIOR_PREVIEW_IDS.characterId) {
      const hybrid = exportWarriorHybridGlb(characterId);
      const glbBase64 = Buffer.from(hybrid.glb).toString("base64");
      return {
        statusTag: "partial" as const,
        implemented: true,
        tool: "export_rt4d_asset",
        format: "glb",
        mimeType: "model/gltf-binary",
        encoding: "base64",
        byteLength: hybrid.glb.byteLength,
        sha256: hybrid.glbSha256,
        glbBase64,
        characterId: hybrid.characterId,
        productionId: parsed.productionId ?? hybrid.productionId,
        assetId: parsed.assetId ?? hybrid.energy.assetId,
        species: hybrid.species,
        vertexCount: hybrid.character.vertexCount,
        triangleCount: hybrid.character.triangleCount,
        glbByteLength: hybrid.glb.byteLength,
        glbSha256: hybrid.glbSha256,
        meshName: hybrid.energy.meshName,
        hybrid: {
          energy: hybrid.energy,
          character: {
            kind: hybrid.character.kind,
            role: hybrid.character.role,
            sculptDocumentId: hybrid.character.sculptDocumentId,
            rigId: hybrid.character.rigId,
            rigSchemaVersion: hybrid.character.rigSchemaVersion,
            vertexCount: hybrid.character.vertexCount,
            blenderAnthroGlbPresent: hybrid.character.blenderAnthroGlbPresent,
          },
        },
        fixtureStatus: hybrid.fixtureStatus,
        productionSculpt: false,
        visualKind: "sculptor_fixture_clay_plus_energy_hull",
        blender: "PRESENT / UNVERIFIED until runtime/bin/blender smoke",
        meshSha256: wireMesh.meshSha256,
        note: hybrid.claim,
        sceneId: scene.sceneId,
      };
    }

    const glb = encodeProjectedMeshToGlb(mesh.positions, mesh.indices);
    const glbSha256 = createHash("sha256").update(glb).digest("hex");
    const glbBase64 = Buffer.from(glb).toString("base64");
    const poseTargetSha256 = createHash("sha256")
      .update(POSE_BONE_IDS.join("\n"), "utf8")
      .digest("hex");
    const characterRigSha256 =
      scene.characterPipeline?.rigBinding?.rigSha256 ?? null;

    return {
      statusTag: "partial" as const,
      implemented: true,
      tool: "export_rt4d_asset",
      format: "glb",
      characterId,
      species,
      vertexCount: mesh.positions.length,
      triangleCount: mesh.indices.length,
      glbByteLength: glb.byteLength,
      glbSha256,
      glbBase64,
      meshName: GLB_MESH_NAME,
      animationTargets: [...POSE_BONE_IDS],
      meshSha256: wireMesh.meshSha256,
      poseTargetSha256,
      rigSha256: characterRigSha256 ?? poseTargetSha256,
      characterRigSha256,
      fixtureStatus: GLB_FIXTURE_STATUS,
      visualKind: "projected_energy_hull",
      productionSculpt: false,
      note: "Partial GLB: 4D→3D projected wire hull (convex/adjacency), named bone targets, single mesh `body`. Not an anatomical fox or production sculpt.",
      sceneId: scene.sceneId,
    };
  } catch (error) {
    return {
      statusTag: "partial" as const,
      implemented: true,
      tool: "export_rt4d_asset",
      error: error instanceof Error ? error.message : String(error),
      note: "Export failed — scene may not have a wire mesh yet. Run create_4d_scene first.",
    };
  }
}

export function handleValidateCharacterContinuity(args: unknown) {
  z.object(validateCharacterContinuityInputShape).parse(args ?? {});
  return declaredStub(
    "validate_character_continuity",
    "Declared governance tool — no continuity claim without state comparison implementation."
  );
}

export function handleReplayAnimeShot(args: unknown) {
  z.object(replayAnimeShotInputShape).parse(args ?? {});
  return declaredStub(
    "replay_anime_shot",
    "Declared — deterministic replay verification not enforced yet. Inspect shotEvidence for partial receipt."
  );
}

export function handleCompareRenderVersions(args: unknown) {
  z.object(compareRenderVersionsInputShape).parse(args ?? {});
  return declaredStub(
    "compare_render_versions",
    "Declared — version compare not implemented."
  );
}

export function handleApproveCanonicalShot(args: unknown) {
  z.object(approveCanonicalShotInputShape).parse(args ?? {});
  return declaredStub(
    "approve_canonical_shot",
    "Declared — no approved scene without a recorded decision store."
  );
}
