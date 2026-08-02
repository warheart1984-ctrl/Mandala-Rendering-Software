/** Minimal OpenAI / MCP Apps host bridge — guarded when not inside a host. */

export type OpenAiHost = {
  toolOutput?: unknown;
  toolInput?: unknown;
  widgetState?: unknown;
  displayMode?: "inline" | "fullscreen" | "pip";
  theme?: string;
  callTool?: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<unknown>;
  requestDisplayMode?: (opts: {
    mode: "inline" | "fullscreen" | "pip";
  }) => Promise<unknown>;
  sendFollowUpMessage?: (opts: { prompt: string }) => Promise<unknown>;
  setWidgetState?: (state: unknown) => void;
};

declare global {
  interface Window {
    openai?: OpenAiHost;
  }
}

export type RotationSpeed = { plane: string; speed: number };

export type ViewerPayload = {
  sceneId?: string;
  previewUrl?: string | null;
  sha256?: string | null;
  source?: string | null;
  rotations?: RotationSpeed[];
  projection?: {
    type?: string;
    distance4d?: number;
    distance3d?: number;
  };
  provenance?: {
    intentId?: string;
    timelineId?: string;
    worldId?: string;
    projector?: {
      type?: string;
      distance4d?: number;
      distance3d?: number;
      planes?: string[];
    };
    hashes?: {
      sceneSha256?: string;
      previewSha256?: string;
    };
  };
  continuityState?: {
    continuityVersion?: number;
    rt4dState?: Record<string, unknown>;
  };
  shotEvidence?: {
    shotId?: string;
    rt4dTransformHash?: string;
    outputHash?: string;
  };
  scene?: {
    rotations?: RotationSpeed[];
    projection?: {
      type?: string;
      distance4d?: number;
      distance3d?: number;
    };
  };
  statusTag?: string;
  visualKind?: string;
  [key: string]: unknown;
};

type McpUiMessage = {
  jsonrpc?: string;
  method?: string;
  params?: {
    structuredContent?: unknown;
  };
};

export function getOpenAi(): OpenAiHost | undefined {
  return typeof window !== "undefined" ? window.openai : undefined;
}

function asPayload(raw: unknown): ViewerPayload | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as ViewerPayload;
}

export function readToolOutput(): ViewerPayload | null {
  return asPayload(getOpenAi()?.toolOutput);
}

export function subscribeToToolOutput(
  onOutput: (payload: ViewerPayload | null) => void
): () => void {
  const onMessage = (event: MessageEvent<McpUiMessage>) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.method !== "ui/notifications/tool-result") return;
    onOutput(asPayload(message.params?.structuredContent));
  };

  window.addEventListener("message", onMessage, { passive: true });
  return () => window.removeEventListener("message", onMessage);
}

export async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<ViewerPayload | null> {
  const openai = getOpenAi();
  if (!openai?.callTool) return null;
  const raw = await openai.callTool(name, args);
  if (raw && typeof raw === "object" && "structuredContent" in raw) {
    return asPayload((raw as { structuredContent: unknown }).structuredContent);
  }
  return asPayload(raw);
}
