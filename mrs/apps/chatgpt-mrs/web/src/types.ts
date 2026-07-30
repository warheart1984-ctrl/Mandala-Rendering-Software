import type { Scene4DDTO } from "@mrs/scene-schema";

/** Minimal OpenAI Apps host bridge — guarded when not inside ChatGPT. */
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

export type InspectResult = Record<string, unknown> | null;

export type ToolOutputPayload = {
  scene?: Scene4DDTO;
  inspectPath?: string;
  render?: {
    pngUrl?: string;
    jobId?: string;
    quality?: string;
    provenance?: Record<string, unknown>;
  };
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

function asToolOutput(raw: unknown): ToolOutputPayload | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as ToolOutputPayload;
}

export function readToolOutput(): ToolOutputPayload | null {
  return asToolOutput(getOpenAi()?.toolOutput);
}

/** Standards-first MCP Apps result subscription with ChatGPT global fallback. */
export function subscribeToToolOutput(
  onOutput: (payload: ToolOutputPayload | null) => void
): () => void {
  const onMessage = (event: MessageEvent<McpUiMessage>) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.method !== "ui/notifications/tool-result") return;
    onOutput(asToolOutput(message.params?.structuredContent));
  };

  window.addEventListener("message", onMessage, { passive: true });
  return () => window.removeEventListener("message", onMessage);
}
