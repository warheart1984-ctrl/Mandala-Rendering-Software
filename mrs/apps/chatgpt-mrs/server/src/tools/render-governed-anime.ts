import { z } from "zod";

const DEFAULT_GENBLAZE_BASE_URL =
  "https://mandala-rendering-system-mrs.onrender.com";
const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_IMAGE_BYTES = 2_000_000;

export const renderGovernedAnimeInputShape = {
  prompt: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "Anime lane intent. The tool forces style=anime and returns governed handoff/provenance; it does not claim full photoreal or verified UE compile."
    ),
  dry_run: z
    .boolean()
    .optional()
    .describe(
      "Default true: return the governed Anime Lane handoff JSON without requiring a live structure render."
    ),
  render_structure: z
    .boolean()
    .optional()
    .describe(
      "When true, ask Genblaze /api/anime for a structure/cel plate if available. Still partial; UE AnimeStylizer remains optional."
    ),
  projection_method: z
    .enum(["projector4d-sot", "drop_w"])
    .optional()
    .describe("Anime structure projection method. Default: projector4d-sot."),
  width: z
    .number()
    .int()
    .min(16)
    .max(512)
    .optional()
    .describe("Structure plate width; capped to 512 for ChatGPT MCP."),
  height: z
    .number()
    .int()
    .min(16)
    .max(512)
    .optional()
    .describe("Structure plate height; capped to 512 for ChatGPT MCP."),
};

const parser = z.object(renderGovernedAnimeInputShape);

type JsonObject = Record<string, unknown>;
type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: "image/png" };

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected an object response");
  }
  return value as JsonObject;
}

function asOptionalObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function genblazeBaseUrl(): string {
  return (
    process.env.MRS_GENBLAZE_BASE_URL?.trim() || DEFAULT_GENBLAZE_BASE_URL
  ).replace(/\/$/, "");
}

function requestHeaders(hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (hasBody) headers["Content-Type"] = "application/json";
  const key = process.env.MRS_GENBLAZE_API_KEY?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function absoluteUrl(baseUrl: string, value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    return new URL(raw, `${baseUrl}/`).toString();
  } catch {
    return null;
  }
}

async function requestJson(
  baseUrl: string,
  path: string,
  body: JsonObject
): Promise<JsonObject> {
  const timeoutMs = Number(
    process.env.MRS_GENBLAZE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS
  );
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS
  );
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: requestHeaders(true),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { detail: text.slice(0, 500) };
      }
    }
    if (!response.ok) {
      const detail = asOptionalObject(payload)?.detail ?? payload;
      throw new Error(
        `${path} returned ${response.status}: ${
          typeof detail === "string" ? detail : JSON.stringify(detail)
        }`
      );
    }
    return asObject(payload);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPng(url: string): Promise<McpContent> {
  const response = await fetch(url, {
    headers: requestHeaders(false),
  });
  if (!response.ok) {
    throw new Error(`preview returned ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  if (
    data.length < 8 ||
    data[0] !== 0x89 ||
    data[1] !== 0x50 ||
    data[2] !== 0x4e ||
    data[3] !== 0x47
  ) {
    throw new Error("preview was not a PNG");
  }
  if (data.length > MAX_IMAGE_BYTES) {
    throw new Error(
      `preview is ${data.length} bytes; cap is ${MAX_IMAGE_BYTES}`
    );
  }
  return {
    type: "image",
    data: data.toString("base64"),
    mimeType: "image/png",
  };
}

export type RenderGovernedAnimeResult = {
  text: string;
  content: McpContent[];
  anime: {
    status: string | null;
    kind: string | null;
    lane: string | null;
    style: string | null;
    styleForced: boolean;
    dryRun: boolean;
    projectionMethod: string | null;
    runId: string | null;
    animeWorldProfileId: string | null;
    structurePreviewUrl: string | null;
    provenance: unknown;
    capabilityTags: unknown;
    nonClaims: unknown;
    raw: JsonObject;
  };
};

export async function handleRenderGovernedAnime(
  args: unknown
): Promise<RenderGovernedAnimeResult> {
  const parsed = parser.parse(args ?? {});
  const dryRun = parsed.dry_run ?? true;
  const renderStructure = parsed.render_structure ?? false;
  const width = parsed.width ?? 256;
  const height = parsed.height ?? 256;
  const projectionMethod = parsed.projection_method ?? "projector4d-sot";
  const baseUrl = genblazeBaseUrl();

  const payload = await requestJson(baseUrl, "/api/anime", {
    prompt: parsed.prompt,
    dry_run: dryRun,
    render_structure: renderStructure,
    projection_method: projectionMethod,
    width,
    height,
  });

  const structure = asOptionalObject(payload.structure);
  const previewUrl = absoluteUrl(baseUrl, structure?.preview_url);
  const runId = asString(payload.run_id);
  const profileId = asString(payload.anime_world_profile_id);
  const status = asString(payload.status);
  const kind = asString(payload.kind);
  const lane = asString(payload.lane);
  const style = asString(payload.style);
  const actualProjection = asString(payload.projection_method);
  const content: McpContent[] = [
    {
      type: "text",
      text:
        `Governed Anime Lane handoff · status=${status ?? "unknown"} · ` +
        `lane=${lane ?? "unknown"} · profile=${profileId ?? "unknown"} · ` +
        `projection=${actualProjection ?? projectionMethod} · run=${
          runId ?? "unknown"
        }. UE AnimeStylizer remains optional skeleton/partial; this is not a verified UE compile or full-photoreal path.`,
    },
  ];

  if (previewUrl) {
    try {
      content.push(await fetchPng(previewUrl));
    } catch (error) {
      content.push({
        type: "text",
        text: `Anime structure preview could not be embedded: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  } else {
    content.push({
      type: "text",
      text:
        "No structure PNG was returned. This is expected for dry-run handoff mode; use render_structure=true only when a live structure plate is needed.",
    });
  }

  return {
    text:
      "Governed Anime Lane handoff complete. Present this as Genblaze /api/anime style-forced metadata and provenance. If a structure image is present, label it as a structure/cel plate, not a verified UE AnimeStylizer render.",
    content,
    anime: {
      status,
      kind,
      lane,
      style,
      styleForced: payload.style_forced === true,
      dryRun: payload.dry_run === true,
      projectionMethod: actualProjection,
      runId,
      animeWorldProfileId: profileId,
      structurePreviewUrl: previewUrl,
      provenance: payload.provenance,
      capabilityTags: payload.capability_tags,
      nonClaims: payload.non_claims,
      raw: payload,
    },
  };
}
