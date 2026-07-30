const DEFAULT_JARVIS_BASE_URL = "http://127.0.0.1:8001";

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function baseUrl(): string {
  return trimSlash(
    process.env.JARVIS_MEMORYBOARD_URL?.trim() || DEFAULT_JARVIS_BASE_URL
  );
}

function makeUrl(pathname: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(pathname, `${baseUrl()}/`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  return JSON.parse(text);
}

async function requestJson(pathname: string, init?: RequestInit, params?: Record<string, string | number | undefined>) {
  const response = await fetch(makeUrl(pathname, params), {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const body = await parseJson(response);
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && typeof body.detail === "string"
        ? body.detail
        : response.statusText;
    throw new Error(`Jarvis memoryboard request failed (${response.status} ${detail})`);
  }
  return body;
}

export async function getJarvisBoard() {
  const body = await requestJson("/api/jarvis/memory/board", undefined, {
    truth_scope: "live",
  });
  return body.memory_board ?? body;
}

export async function searchJarvisMemories({
  query,
  limit = 12,
  truthScope = "live",
}: {
  query?: string;
  limit?: number;
  truthScope?: "live" | "archived";
}) {
  const body = await requestJson("/api/jarvis/memory", undefined, {
    truth_scope: truthScope,
    query,
    limit,
  });
  return Array.isArray(body.memories) ? body.memories : [];
}

export async function fetchJarvisMemory(memoryId: string) {
  const body = await requestJson(
    `/api/jarvis/memory/${encodeURIComponent(memoryId)}`
  );
  return body.memory ?? body;
}

export async function writeJarvisMemory({
  content,
  category = "signal",
  tags = [],
  scope = "session",
  stateClass = "live",
  truthStatus = "stable_user",
}: {
  content: string;
  category?: string;
  tags?: string[];
  scope?: "persistent" | "session";
  stateClass?: "live" | "archived";
  truthStatus?: "canonical" | "stable_user" | "signal" | "pending";
}) {
  const body = await requestJson("/api/jarvis/memory", {
    method: "POST",
    body: JSON.stringify({
      content,
      category,
      tags,
      scope,
      state_class: stateClass,
      truth_status: truthStatus,
    }),
  });
  return body.memory ?? body;
}

export async function updateJarvisMemory(
  memoryId: string,
  {
    content,
    category,
    tags,
    scope,
    stateClass,
    truthStatus,
  }: {
    content?: string;
    category?: string;
    tags?: string[];
    scope?: "persistent" | "session";
    stateClass?: "live" | "archived";
    truthStatus?: "canonical" | "stable_user" | "signal" | "pending";
  }
) {
  const body = await requestJson(
    `/api/jarvis/memory/${encodeURIComponent(memoryId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...(content !== undefined ? { content } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(tags !== undefined ? { tags } : {}),
        ...(scope !== undefined ? { scope } : {}),
        ...(stateClass !== undefined ? { state_class: stateClass } : {}),
        ...(truthStatus !== undefined ? { truth_status: truthStatus } : {}),
      }),
    }
  );
  return body.memory ?? body;
}

export async function deleteJarvisMemory(memoryId: string) {
  return requestJson(`/api/jarvis/memory/${encodeURIComponent(memoryId)}`, {
    method: "DELETE",
  });
}

export function getJarvisMemoryboardBaseUrl() {
  return baseUrl();
}
