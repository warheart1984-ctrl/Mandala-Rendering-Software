/**
 * HoloRT4D Spatial Tokens — MCP server (tools first, no custom UI).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { authorize } from "./internal/authorize.js";
import { loadSpatialCore, type SpatialToken } from "./internal/core.js";
import { resolveUnderOutput } from "./internal/sandbox.js";
import { SCHEME_DOCS, SPATIAL_MODES } from "./internal/scheme.js";
import {
  normalizeTokenizeArgs,
  runSpatialTokenize,
  verifyTokenHash,
} from "./internal/tokenize-logic.js";

export const SERVER_NAME = "holort4d-spatial";
export const SERVER_VERSION = "1.0.0";

/** First ~512 chars matter for host routing. */
export const SERVER_INSTRUCTIONS =
  "HoloRT4D Spatial Tokens (HoloRT4D-Spatial-V1). Call spatial_tokenize for depth→token JSON; prefer depth[] from chamber/opticalLength/landmark-z (enforced, deterministic). Modes: face|room|object. resolution 8x8|16x16. image_base64=grayscale pseudo-depth only (partial)—not metric photo depth (declared). Use get_spatial_scheme, list_spatial_modes, verify_spatial_hash. Optional tokenize_chamber_frame (output/ sandbox). Rate limit: declared stub. No secrets.";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_MD_PATH = path.resolve(__dirname, "../skills/spatial-token-usage/SKILL.md");

const resolutionSchema = z.union([
  z.literal(8),
  z.literal(16),
  z.literal("8x8"),
  z.literal("16x16"),
]);

const modeSchema = z.enum(["face", "room", "object"]);

const spatialTokenizeInput = {
  mode: modeSchema.describe("Spatial context: face | room | object"),
  resolution: resolutionSchema
    .default(16)
    .describe('Grid resolution: 8, 16, "8x8", or "16x16"'),
  width: z.number().int().positive().optional().describe("Depth/image width"),
  height: z.number().int().positive().optional().describe("Depth/image height"),
  depth: z
    .array(z.number())
    .optional()
    .describe("Row-major Float32 depth (preferred enforced path)"),
  prev_depth: z
    .array(z.number())
    .optional()
    .describe("Previous frame depth for motion (partial)"),
  image_base64: z
    .string()
    .optional()
    .describe(
      "Raw RGBA base64 + width/height → grayscale pseudo-depth (partial). Not metric."
    ),
  include_motion: z
    .boolean()
    .optional()
    .describe("Attach motion when prev_depth present (partial)"),
  face_landmarks_xyz: z
    .array(z.number())
    .optional()
    .describe("Packed landmark XYZ for face.* labels (partial)"),
  brief_id: z.string().max(128).optional(),
};

const tokenizeOutput = {
  scheme: z.string(),
  hash: z.string(),
  resolution: z.number(),
  cell_count: z.number(),
  mode: modeSchema,
  depth_source: z.enum([
    "depth_grid",
    "grayscale_pseudo_depth",
    "synthetic_ramp",
  ]),
  depth_status: z.enum(["enforced", "partial", "declared"]),
  token: z.record(z.unknown()),
  status: z.record(z.string()),
  note: z.string(),
};

const schemeOutput = {
  scheme: z.string(),
  docs: z.record(z.unknown()),
  modes: z.array(z.record(z.unknown())),
};

const verifyInput = {
  token: z
    .record(z.unknown())
    .describe("Spatial token object (HoloRT4D-Spatial-V1)"),
  expected_hash: z
    .string()
    .optional()
    .describe("Optional SHA-256 hex to compare"),
};

const verifyOutput = {
  ok: z.boolean(),
  computed_hash: z.string(),
  expected_hash: z.string().nullable(),
  match: z.boolean().nullable(),
  scheme: z.string().optional(),
  note: z.string(),
};

const modesOutput = {
  modes: z.array(
    z.object({
      id: modeSchema,
      title: z.string(),
      when: z.string(),
      notes: z.string(),
    })
  ),
  prefer: z.string(),
};

const chamberInput = {
  path: z
    .string()
    .min(1)
    .describe(
      "Path under repo output/ to a .bin depth or landmark-z file (sandboxed)"
    ),
  mode: modeSchema.default("object"),
  resolution: resolutionSchema.default(16),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  include_motion: z.boolean().optional(),
};

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    structuredContent: { error: message },
    isError: true as const,
  };
}

function skillDigest(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

export function createSpatialMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: {
        extensions: {
          "io.modelcontextprotocol/skills": {},
        },
      },
    }
  );

  // --- skills (optional SEP-2640 style resources) ---
  let skillMd = "";
  try {
    skillMd = fs.readFileSync(SKILL_MD_PATH, "utf8");
  } catch {
    skillMd =
      "# Spatial Token Usage\n\nPrefer depth[] → spatial_tokenize. Modes: face|room|object.\n";
  }
  const skillUri = "skill://holort4d-spatial/spatial-token-usage/SKILL.md";
  const skillIndexUri = "skill://index.json";
  const digest = skillDigest(skillMd);
  const skillIndex = {
    skills: [
      {
        name: "spatial-token-usage",
        description:
          "When and how to tokenize HoloRT4D Spatial Tokens (depth-first, honest status).",
        url: skillUri,
        digest,
        type: "skill-md",
      },
    ],
  };

  server.registerResource(
    "spatial-token-usage-skill",
    skillUri,
    {
      description: "Agent skill: HoloRT4D Spatial Token usage",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: skillUri,
          mimeType: "text/markdown",
          text: skillMd,
          _meta: { digest },
        },
      ],
    })
  );

  server.registerResource(
    "skills-index",
    skillIndexUri,
    {
      description: "Skills extension index (skill://)",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: skillIndexUri,
          mimeType: "application/json",
          text: JSON.stringify(skillIndex, null, 2),
        },
      ],
    })
  );

  // --- tools ---

  server.registerTool(
    "spatial_tokenize",
    {
      title: "Spatial Tokenize",
      description:
        "Convert a Float32 depth grid (preferred), raw RGBA image_base64 as grayscale pseudo-depth (partial), or synthetic ramp into HoloRT4D-Spatial-V1 JSON + SHA-256 hash. Deterministic for the same depth inputs. Photo→metric depth is declared (not implemented).",
      inputSchema: spatialTokenizeInput,
      outputSchema: tokenizeOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        await authorize({ toolName: "spatial_tokenize" });
        const core = await loadSpatialCore();
        const input = normalizeTokenizeArgs(args);
        const result = runSpatialTokenize(core, input);
        const text =
          `${result.note}\n` +
          `scheme=${result.scheme} mode=${result.mode} resolution=${result.resolution} ` +
          `cells=${result.cell_count} hash=${result.hash} depth_status=${result.depth_status}`;
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: result,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "get_spatial_scheme",
    {
      title: "Get Spatial Scheme Docs",
      description:
        "Return HoloRT4D-Spatial-V1 field meanings, GridCell layout, hash rules, and honest status tags.",
      inputSchema: {},
      outputSchema: schemeOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        await authorize({ toolName: "get_spatial_scheme" });
        const docs = { ...SCHEME_DOCS };
        const modes = SPATIAL_MODES.map((m) => ({ ...m }));
        const structuredContent = {
          scheme: SCHEME_DOCS.scheme,
          docs,
          modes,
        };
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(structuredContent, null, 2),
            },
          ],
          structuredContent,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "verify_spatial_hash",
    {
      title: "Verify Spatial Token Hash",
      description:
        "Recompute SHA-256 of a Spatial Token via canonical JSON and optionally confirm it matches expected_hash.",
      inputSchema: verifyInput,
      outputSchema: verifyOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        await authorize({ toolName: "verify_spatial_hash" });
        const core = await loadSpatialCore();
        const token = args.token as SpatialToken;
        if (!token || typeof token !== "object") {
          throw new Error("token object required");
        }
        const verified = verifyTokenHash(core, token, args.expected_hash);
        const note =
          verified.match === null
            ? `Computed hash ${verified.computed_hash} (no expected_hash given).`
            : verified.match
              ? "Hash matches."
              : `Hash mismatch: computed ${verified.computed_hash} vs expected ${verified.expected_hash}.`;
        const structuredContent = {
          ...verified,
          scheme: typeof token.scheme === "string" ? token.scheme : undefined,
          note,
        };
        return {
          content: [{ type: "text" as const, text: note }],
          structuredContent,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "list_spatial_modes",
    {
      title: "List Spatial Modes",
      description:
        "List face | room | object modes and when to use each for spatial_tokenize.",
      inputSchema: {},
      outputSchema: modesOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        await authorize({ toolName: "list_spatial_modes" });
        const structuredContent = {
          modes: SPATIAL_MODES.map((m) => ({ ...m })),
          prefer: SCHEME_DOCS.prefer,
        };
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(structuredContent, null, 2),
            },
          ],
          structuredContent,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "tokenize_chamber_frame",
    {
      title: "Tokenize Chamber Frame",
      description:
        "Load a .bin depth/landmark-z file from sandboxed repo output/ and tokenize to HoloRT4D-Spatial-V1. Local filesystem only; paths outside output/ are rejected.",
      inputSchema: chamberInput,
      outputSchema: tokenizeOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        await authorize({ toolName: "tokenize_chamber_frame" });
        const core = await loadSpatialCore();
        const abs = resolveUnderOutput(args.path);
        if (!abs.endsWith(".bin")) {
          throw new Error("chamber frame must be a .bin file");
        }
        const buf = fs.readFileSync(abs);
        let depth = new Float32Array(
          buf.buffer,
          buf.byteOffset,
          Math.floor(buf.byteLength / 4)
        );
        let width = Number(args.width ?? 0);
        let height = Number(args.height ?? 0);
        if (!width || !height) {
          // Infer square if perfect square length; else landmark-z expand to 16×16
          const n = depth.length;
          const side = Math.sqrt(n);
          if (Number.isInteger(side) && side >= 2) {
            width = side;
            height = side;
          } else {
            width = 16;
            height = 16;
            const zs = depth;
            depth = new Float32Array(width * height);
            for (let i = 0; i < depth.length; i++) {
              depth[i] = zs[i % zs.length] ?? 0;
            }
          }
        } else if (depth.length < width * height) {
          const zs = depth;
          const expanded = new Float32Array(width * height);
          for (let i = 0; i < expanded.length; i++) {
            expanded[i] = zs[i % zs.length] ?? 0;
          }
          depth = expanded;
        }

        const resolution =
          args.resolution === "8x8" || args.resolution === 8 ? 8 : 16;
        const result = runSpatialTokenize(core, {
          mode: args.mode ?? "object",
          resolution,
          width,
          height,
          depth: Array.from(depth),
          include_motion: args.include_motion,
          brief_id: `chamber:${path.basename(abs)}`,
        });
        result.note = `Chamber tape ${path.relative(path.join(abs, "../.."), abs) || path.basename(abs)} → ${result.note}`;
        // Avoid leaking absolute host paths beyond basename
        result.note = `Chamber bin ${path.basename(abs)} tokenized. ${result.depth_status} depth path. hash=${result.hash}`;
        const text = result.note;
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: result,
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : String(err));
      }
    }
  );

  return server;
}

export const TOOL_NAMES = [
  "spatial_tokenize",
  "get_spatial_scheme",
  "verify_spatial_hash",
  "list_spatial_modes",
  "tokenize_chamber_frame",
] as const;
