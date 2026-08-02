import { z } from "zod";

/** Declared / skeleton tools — clear NotImplemented envelopes. */

export const exportRt4dAssetInputShape = {
  sceneId: z.string().min(1),
  format: z.enum(["png", "json", "unity", "unreal"]).optional(),
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
  z.object(exportRt4dAssetInputShape).parse(args ?? {});
  return declaredStub(
    "export_rt4d_asset",
    "Skeleton — Unity/Unreal/game asset export is declared until built. No export claim without file validation."
  );
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
