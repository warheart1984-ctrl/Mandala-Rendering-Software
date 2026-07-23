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
  [key: string]: unknown;
};

export function getOpenAi(): OpenAiHost | undefined {
  return typeof window !== "undefined" ? window.openai : undefined;
}

export function readToolOutput(): ToolOutputPayload | null {
  const raw = getOpenAi()?.toolOutput;
  if (!raw || typeof raw !== "object") return null;
  return raw as ToolOutputPayload;
}
