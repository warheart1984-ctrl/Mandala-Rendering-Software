/**
 * Pure tokenize helpers shared by tools + tests.
 */
import type { SpatialCore, SpatialToken } from "./core.js";
import type { SpatialModeId } from "./scheme.js";

export type ResolutionChoice = 8 | 16;

export type TokenizeInput = {
  mode: SpatialModeId;
  resolution: ResolutionChoice;
  width?: number;
  height?: number;
  depth?: number[];
  prev_depth?: number[];
  image_base64?: string;
  include_motion?: boolean;
  face_landmarks_xyz?: number[];
  brief_id?: string;
};

export type TokenizeResult = {
  scheme: string;
  hash: string;
  resolution: number;
  cell_count: number;
  mode: SpatialModeId;
  depth_source: "depth_grid" | "grayscale_pseudo_depth" | "synthetic_ramp";
  depth_status: "enforced" | "partial" | "declared";
  token: SpatialToken;
  status: Record<string, string>;
  note: string;
};

function parseResolution(v: unknown): ResolutionChoice {
  if (v === 8 || v === "8" || v === "8x8") return 8;
  if (v === 16 || v === "16" || v === "16x16") return 16;
  throw new Error('resolution must be 8|16 or "8x8"|"16x16"');
}

/** Decode data-URL or raw base64 to Buffer. */
export function decodeBase64Payload(imageBase64: string): Buffer {
  let s = imageBase64.trim();
  const m = /^data:[^;]+;base64,(.+)$/i.exec(s);
  if (m) s = m[1]!;
  // Cap ~8 MiB decoded to avoid abuse
  if (s.length > 11_000_000) {
    throw new Error("image_base64 too large (max ~8 MiB decoded)");
  }
  const buf = Buffer.from(s, "base64");
  if (buf.length === 0) throw new Error("image_base64 decoded empty");
  return buf;
}

/**
 * Interpret base64 as raw RGBA (needs width*height*4) for pseudo-depth.
 * PNG/JPEG metric depth is declared — not decoded here without ML.
 */
export function rgbaFromBase64(
  imageBase64: string,
  width: number,
  height: number
): Uint8Array {
  const buf = decodeBase64Payload(imageBase64);
  const need = width * height * 4;
  if (buf.length < need) {
    throw new Error(
      `image_base64 as RGBA needs width*height*4=${need} bytes; got ${buf.length}. ` +
        "PNG/JPEG→metric depth is declared (not implemented). Prefer depth[], or raw RGBA + width/height for grayscale pseudo-depth (partial)."
    );
  }
  return new Uint8Array(buf.buffer, buf.byteOffset, need);
}

export function syntheticRamp(size: number): Float32Array {
  const d = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      d[y * size + x] = (x + y) / (2 * size);
    }
  }
  return d;
}

export function normalizeTokenizeArgs(raw: {
  mode: SpatialModeId;
  resolution: 8 | 16 | "8x8" | "16x16";
  width?: number;
  height?: number;
  depth?: number[];
  prev_depth?: number[];
  image_base64?: string;
  include_motion?: boolean;
  face_landmarks_xyz?: number[];
  brief_id?: string;
}): TokenizeInput {
  return {
    mode: raw.mode,
    resolution: parseResolution(raw.resolution),
    width: raw.width,
    height: raw.height,
    depth: raw.depth,
    prev_depth: raw.prev_depth,
    image_base64: raw.image_base64,
    include_motion: raw.include_motion,
    face_landmarks_xyz: raw.face_landmarks_xyz,
    brief_id: raw.brief_id,
  };
}

export function runSpatialTokenize(
  core: SpatialCore,
  input: TokenizeInput
): TokenizeResult {
  const resolution = input.resolution;
  let depth: Float32Array;
  let width: number;
  let height: number;
  let depth_source: TokenizeResult["depth_source"];
  let depth_status: TokenizeResult["depth_status"];
  let note: string;

  if (input.depth && input.depth.length > 0) {
    width = Number(input.width);
    height = Number(input.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      throw new Error("width and height are required with depth[]");
    }
    const n = width * height;
    if (input.depth.length < n) {
      throw new Error(`depth length ${input.depth.length} < width*height ${n}`);
    }
    depth = Float32Array.from(input.depth.slice(0, n));
    depth_source = "depth_grid";
    depth_status = "enforced";
    note = "Tokenized from Float32 depth grid (enforced path).";
  } else if (input.image_base64) {
    width = Number(input.width);
    height = Number(input.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      throw new Error(
        "width and height required with image_base64 (raw RGBA). Photo→metric depth is declared."
      );
    }
    const rgba = rgbaFromBase64(input.image_base64, width, height);
    depth = core.grayscalePseudoDepth(rgba, width, height);
    depth_source = "grayscale_pseudo_depth";
    depth_status = "partial";
    note =
      "Grayscale luminance invert pseudo-depth (partial). Not metric; not ML. Prefer chamber depth[].";
  } else {
    // Synthetic ramp for demos / Inspector smoke
    const size = resolution === 8 ? 32 : 64;
    depth = syntheticRamp(size);
    width = size;
    height = size;
    depth_source = "synthetic_ramp";
    depth_status = "enforced";
    note = `No depth/image provided — used synthetic ramp ${size}×${size} (deterministic demo).`;
  }

  /** @type {Record<string, unknown>} */
  const opts: Record<string, unknown> = {
    width,
    height,
    resolution,
    meta: {
      mode: input.mode,
      depth_source,
      depth_status,
      brief_id: input.brief_id ?? "spatial-token-mcp",
      mcp: "holort4d-spatial",
    },
  };

  if (
    input.include_motion &&
    input.prev_depth &&
    input.prev_depth.length >= width * height
  ) {
    opts.prevDepth = Float32Array.from(input.prev_depth.slice(0, width * height));
  } else if (input.include_motion && !input.prev_depth) {
    note +=
      " include_motion set but prev_depth missing — motion skipped (partial).";
  }

  if (input.face_landmarks_xyz && input.face_landmarks_xyz.length >= 3) {
    opts.faceRig = core.faceRigFromLandmarkXYZ(
      Float32Array.from(input.face_landmarks_xyz)
    );
  }

  const token = core.tokenizeFromDepthGrid(depth, opts);
  const hash = core.hashSpatialToken(token);

  return {
    scheme: core.SPATIAL_TOKEN_SCHEME,
    hash,
    resolution: token.resolution,
    cell_count: token.cells.length,
    mode: input.mode,
    depth_source,
    depth_status,
    token,
    status: { ...core.SPATIAL_TOKEN_STATUS },
    note,
  };
}

export function verifyTokenHash(
  core: SpatialCore,
  token: SpatialToken,
  expectedHash?: string
): {
  ok: boolean;
  computed_hash: string;
  expected_hash: string | null;
  match: boolean | null;
} {
  const computed_hash = core.hashSpatialToken(token);
  if (expectedHash == null || expectedHash === "") {
    return {
      ok: true,
      computed_hash,
      expected_hash: null,
      match: null,
    };
  }
  const expected = expectedHash.trim().toLowerCase();
  const match = computed_hash === expected;
  return {
    ok: match,
    computed_hash,
    expected_hash: expected,
    match,
  };
}
