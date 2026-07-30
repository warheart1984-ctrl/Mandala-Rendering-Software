/**
 * Jarvis session utility for startup context and end-of-session summaries.
 */

function uniqueStrings(values) {
  const out = [];
  for (const value of values ?? []) {
    const cleaned = String(value ?? "").trim();
    if (cleaned && !out.includes(cleaned)) out.push(cleaned);
  }
  return out;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

export function formatJarvisSessionSummary({
  objective = "",
  decisions = [],
  touchedSystems = [],
  openThreads = [],
  notes = [],
} = {}) {
  const sections = [];
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

export class JarvisSession {
  constructor(memoryClient, { query, limit = 32, includeBoard = true } = {}) {
    if (!memoryClient || typeof memoryClient.loadSessionContext !== "function") {
      throw new TypeError("JarvisSession requires a memory client");
    }
    this.memory = memoryClient;
    this.options = { query, limit, includeBoard };
    this.state = {
      status: "idle",
      board: null,
      memories: [],
      objective: "",
      decisions: [],
      touchedSystems: [],
      openThreads: [],
      notes: [],
      lastSummary: "",
      lastWrittenMemory: null,
      autoPersistInstalled: false,
      error: null,
    };
  }

  async start(overrides = {}) {
    const options = { ...this.options, ...overrides };
    this.state.status = "loading";
    try {
      const context = await this.memory.loadSessionContext(options);
      this.state.board = context.board ?? null;
      this.state.memories = Array.isArray(context.memories) ? context.memories : [];
      this.state.status = "ready";
      this.state.error = null;
      return this.snapshot();
    } catch (error) {
      this.state.status = "error";
      this.state.error = error;
      throw error;
    }
  }

  setObjective(objective) {
    this.state.objective = cleanText(objective);
    return this.state.objective;
  }

  addDecision(value) {
    this.state.decisions = uniqueStrings([...this.state.decisions, value]);
    return this.state.decisions;
  }

  addTouchedSystem(value) {
    this.state.touchedSystems = uniqueStrings([...this.state.touchedSystems, value]);
    return this.state.touchedSystems;
  }

  addOpenThread(value) {
    this.state.openThreads = uniqueStrings([...this.state.openThreads, value]);
    return this.state.openThreads;
  }

  addNote(value) {
    this.state.notes = uniqueStrings([...this.state.notes, value]);
    return this.state.notes;
  }

  snapshot() {
    return {
      status: this.state.status,
      board: this.state.board,
      memories: [...this.state.memories],
      objective: this.state.objective,
      decisions: [...this.state.decisions],
      touchedSystems: [...this.state.touchedSystems],
      openThreads: [...this.state.openThreads],
      notes: [...this.state.notes],
      lastSummary: this.state.lastSummary,
      lastWrittenMemory: this.state.lastWrittenMemory,
      autoPersistInstalled: this.state.autoPersistInstalled,
      error: this.state.error,
    };
  }

  buildSummary(overrides = {}) {
    const summary = formatJarvisSessionSummary({
      objective: overrides.objective ?? this.state.objective,
      decisions: overrides.decisions ?? this.state.decisions,
      touchedSystems: overrides.touchedSystems ?? this.state.touchedSystems,
      openThreads: overrides.openThreads ?? this.state.openThreads,
      notes: overrides.notes ?? this.state.notes,
    });
    this.state.lastSummary = summary;
    return summary;
  }

  async writeSummary({
    tags = [],
    category = "signal",
    scope = "session",
    stateClass = "live",
    truthStatus = "stable_user",
    ...summaryOverrides
  } = {}) {
    const content = this.buildSummary(summaryOverrides);
    const memory = await this.memory.writeSessionSummary({
      content,
      tags,
      category,
      scope,
      stateClass,
      truthStatus,
    });
    this.state.lastWrittenMemory = memory;
    return memory;
  }

  installAutoPersist(target, {
    tags = ["jarvis", "session", "auto"],
    category = "signal",
    stateClass = "live",
    truthStatus = "stable_user",
    getSummary = null,
  } = {}) {
    if (!target || typeof target.addEventListener !== "function") {
      throw new TypeError("JarvisSession.installAutoPersist requires an event target");
    }
    if (this.state.autoPersistInstalled) {
      return this._autoPersistCleanup ?? (() => {});
    }

    let flushed = false;
    const flush = async (reason) => {
      if (flushed) return;
      flushed = true;
      try {
        if (typeof getSummary === "function") {
          const extra = getSummary(reason) ?? {};
          if (extra.objective) this.setObjective(extra.objective);
          for (const decision of extra.decisions ?? []) this.addDecision(decision);
          for (const system of extra.touchedSystems ?? []) this.addTouchedSystem(system);
          for (const thread of extra.openThreads ?? []) this.addOpenThread(thread);
          for (const note of extra.notes ?? []) this.addNote(note);
        }
        this.addNote(`Auto-persisted on ${reason}`);
        await this.writeSummary({
          tags,
          category,
          stateClass,
          truthStatus,
        });
      } catch {
        // Best-effort persistence should never block app shutdown.
      }
    };

    const onPageHide = () => { void flush("pagehide"); };
    const onBeforeUnload = () => { void flush("beforeunload"); };
    target.addEventListener("pagehide", onPageHide);
    target.addEventListener("beforeunload", onBeforeUnload);

    this.state.autoPersistInstalled = true;
    this._autoPersistCleanup = () => {
      target.removeEventListener?.("pagehide", onPageHide);
      target.removeEventListener?.("beforeunload", onBeforeUnload);
      this.state.autoPersistInstalled = false;
      this._autoPersistCleanup = null;
    };
    return this._autoPersistCleanup;
  }
}

export async function createJarvisSession(memoryClient, options = {}) {
  const session = new JarvisSession(memoryClient, options);
  await session.start();
  return session;
}
