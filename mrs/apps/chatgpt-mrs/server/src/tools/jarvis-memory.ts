import { z } from "zod";

import {
  deleteJarvisMemory,
  fetchJarvisMemory,
  getJarvisBoard,
  getJarvisMemoryboardBaseUrl,
  searchJarvisMemories,
  updateJarvisMemory,
  writeJarvisMemory,
} from "../jarvis-memoryboard.js";

function uniqueStrings(values: Array<string | undefined> = []) {
  const out: string[] = [];
  for (const value of values) {
    const cleaned = String(value ?? "").trim();
    if (cleaned && !out.includes(cleaned)) out.push(cleaned);
  }
  return out;
}

function cleanText(value: string | undefined) {
  return String(value ?? "").trim();
}

export function formatJarvisSessionSummary({
  objective = "",
  decisions = [],
  touchedSystems = [],
  openThreads = [],
  notes = [],
}: {
  objective?: string;
  decisions?: string[];
  touchedSystems?: string[];
  openThreads?: string[];
  notes?: string[];
}) {
  const sections: string[] = [];
  const goal = cleanText(objective);
  if (goal) sections.push(`Objective: ${goal}`);

  const cleanedDecisions = uniqueStrings(decisions);
  if (cleanedDecisions.length) {
    sections.push(`Decisions: ${cleanedDecisions.join(" | ")}`);
  }

  const cleanedSystems = uniqueStrings(touchedSystems);
  if (cleanedSystems.length) {
    sections.push(`Touched systems: ${cleanedSystems.join(", ")}`);
  }

  const cleanedThreads = uniqueStrings(openThreads);
  if (cleanedThreads.length) {
    sections.push(`Open threads: ${cleanedThreads.join(" | ")}`);
  }

  const cleanedNotes = uniqueStrings(notes);
  if (cleanedNotes.length) {
    sections.push(`Notes: ${cleanedNotes.join(" | ")}`);
  }

  return sections.join("\n");
}

export const searchJarvisMemoryInputShape = {
  query: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Optional free-text query to filter memories by content or tags."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(32)
    .optional()
    .describe("Maximum number of memories to return. Default 12."),
  truthScope: z
    .enum(["live", "archived"])
    .optional()
    .describe("Whether to read current live memories or archived ones."),
};

export const fetchJarvisMemoryInputShape = {
  memoryId: z
    .string()
    .min(1)
    .describe("The Jarvis memory id, for example mem-abc123."),
};

export const writeJarvisMemoryInputShape = {
  content: z
    .string()
    .min(1)
    .max(2000)
    .describe("Memory content to persist."),
  category: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("Memory category, for example signal, preference, or identity."),
  tags: z
    .array(z.string().min(1).max(64))
    .max(16)
    .optional()
    .describe("Optional tags to help future search and filtering."),
  scope: z
    .enum(["persistent", "session"])
    .optional()
    .describe("Whether the memory should persist beyond a single session."),
  stateClass: z
    .enum(["live", "archived"])
    .optional()
    .describe("Whether the record is live or archived."),
  truthStatus: z
    .enum(["canonical", "stable_user", "signal", "pending"])
    .optional()
    .describe("Truth classification for the memory."),
};

export const updateJarvisMemoryInputShape = {
  memoryId: z
    .string()
    .min(1)
    .describe("The Jarvis memory id to update."),
  content: z
    .string()
    .min(1)
    .max(2000)
    .optional()
    .describe("Updated memory content."),
  category: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("Updated memory category."),
  tags: z
    .array(z.string().min(1).max(64))
    .max(16)
    .optional()
    .describe("Updated tag list."),
  scope: z
    .enum(["persistent", "session"])
    .optional()
    .describe("Updated scope."),
  stateClass: z
    .enum(["live", "archived"])
    .optional()
    .describe("Updated state class."),
  truthStatus: z
    .enum(["canonical", "stable_user", "signal", "pending"])
    .optional()
    .describe("Updated truth status."),
};

export const deleteJarvisMemoryInputShape = {
  memoryId: z
    .string()
    .min(1)
    .describe("The Jarvis memory id to delete."),
};

export const writeJarvisSessionSummaryInputShape = {
  objective: z
    .string()
    .min(1)
    .max(300)
    .describe("Primary session objective or current goal."),
  decisions: z
    .array(z.string().min(1).max(300))
    .max(16)
    .optional()
    .describe("Key decisions made during the session."),
  touchedSystems: z
    .array(z.string().min(1).max(200))
    .max(16)
    .optional()
    .describe("Files, subsystems, services, or apps touched in the session."),
  openThreads: z
    .array(z.string().min(1).max(300))
    .max(16)
    .optional()
    .describe("Follow-up items or open threads to revisit later."),
  notes: z
    .array(z.string().min(1).max(300))
    .max(16)
    .optional()
    .describe("Additional notes worth carrying into the next session."),
  tags: z
    .array(z.string().min(1).max(64))
    .max(16)
    .optional()
    .describe("Optional search tags for the saved summary."),
  category: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("Optional memory category. Default signal."),
  scope: z
    .enum(["persistent", "session"])
    .optional()
    .describe("Whether the summary is for one session or durable project memory."),
  stateClass: z
    .enum(["live", "archived"])
    .optional()
    .describe("Whether the saved summary is live or archived."),
  truthStatus: z
    .enum(["canonical", "stable_user", "signal", "pending"])
    .optional()
    .describe("Truth classification for the summary."),
};

export async function handleSearchJarvisMemory(args: {
  query?: string;
  limit?: number;
  truthScope?: "live" | "archived";
}) {
  const [board, memories] = await Promise.all([
    getJarvisBoard(),
    searchJarvisMemories(args),
  ]);
  return {
    text:
      memories.length > 0
        ? `Found ${memories.length} Jarvis ${args.truthScope ?? "live"} memories.`
        : `No Jarvis ${args.truthScope ?? "live"} memories matched.`,
    structured: {
      board,
      memories,
      source: getJarvisMemoryboardBaseUrl(),
    },
  };
}

export async function handleFetchJarvisMemory(args: { memoryId: string }) {
  const memory = await fetchJarvisMemory(args.memoryId);
  return {
    text: `Fetched Jarvis memory ${memory.id}.`,
    structured: {
      memory,
      source: getJarvisMemoryboardBaseUrl(),
    },
  };
}

export async function handleWriteJarvisMemory(args: {
  content: string;
  category?: string;
  tags?: string[];
  scope?: "persistent" | "session";
  stateClass?: "live" | "archived";
  truthStatus?: "canonical" | "stable_user" | "signal" | "pending";
}) {
  const memory = await writeJarvisMemory(args);
  return {
    text: `Stored Jarvis memory ${memory.id}.`,
    structured: {
      memory,
      source: getJarvisMemoryboardBaseUrl(),
    },
  };
}

export async function handleUpdateJarvisMemory(args: {
  memoryId: string;
  content?: string;
  category?: string;
  tags?: string[];
  scope?: "persistent" | "session";
  stateClass?: "live" | "archived";
  truthStatus?: "canonical" | "stable_user" | "signal" | "pending";
}) {
  const { memoryId, ...patch } = args;
  const memory = await updateJarvisMemory(memoryId, patch);
  return {
    text: `Updated Jarvis memory ${memory.id}.`,
    structured: {
      memory,
      source: getJarvisMemoryboardBaseUrl(),
    },
  };
}

export async function handleWriteJarvisSessionSummary(args: {
  objective: string;
  decisions?: string[];
  touchedSystems?: string[];
  openThreads?: string[];
  notes?: string[];
  tags?: string[];
  category?: string;
  scope?: "persistent" | "session";
  stateClass?: "live" | "archived";
  truthStatus?: "canonical" | "stable_user" | "signal" | "pending";
}) {
  const content = formatJarvisSessionSummary(args);
  const memory = await writeJarvisMemory({
    content,
    tags: args.tags ?? ["jarvis", "session", "summary"],
    category: args.category,
    scope: args.scope,
    stateClass: args.stateClass,
    truthStatus: args.truthStatus,
  });
  return {
    text: `Stored Jarvis session summary ${memory.id}.`,
    structured: {
      memory,
      summary: content,
      source: getJarvisMemoryboardBaseUrl(),
    },
  };
}

export async function handleDeleteJarvisMemory(args: { memoryId: string }) {
  const result = await deleteJarvisMemory(args.memoryId);
  return {
    text: `Deleted Jarvis memory ${args.memoryId}.`,
    structured: {
      ...result,
      memoryId: args.memoryId,
      source: getJarvisMemoryboardBaseUrl(),
    },
  };
}
