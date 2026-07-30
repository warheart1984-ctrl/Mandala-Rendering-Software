/**
 * Engine boot — constitution + CKL/GK from /engine/ + world/timeline.
 * Single source of truth: engine/governance + engine/scripting.
 */

import { CHARTER } from "../constitution/charter.js";
import { ConstitutionalStateEngine } from "../constitution/cse.js";
import { GovernanceKernel } from "../../engine/governance/GovernanceKernel.js";
import { ConstitutionalKnowledgeLayer } from "../../engine/governance/ConstitutionalKnowledgeLayer.js";
import { createIslEngine } from "../../engine/scripting/IslInterpreter.js";
import { ISL_OPENING_4D_REVEAL } from "../../engine/scripting/scripts/opening_4d_reveal.isl.js";
import { ISL_MYTHAR_ASCENSION } from "../../engine/scripting/scripts/mythar_ascension.isl.js";
import { IntentService } from "./services/intent.js";
import { EvidenceService } from "./services/evidence.js";
import { createJarvisMemoryClient } from "./services/jarvis-memory.js";
import { createJarvisSession } from "./services/jarvis-session.js";
import { ExecutionOrchestrator } from "./services/orchestrator.js";
import { ReplayService } from "./services/replay.js";
import { SceneGraph } from "./scene/SceneGraph.js";
import { TimelinePlayer } from "./cinematic/TimelinePlayer.js";
import { ProvenanceRecorder } from "../../engine/runtime/ProvenanceRecorder.js";
import { CssvRegistry, BrowserCssvHost } from "../../engine/cssv/CssvRegistry.js";

export async function bootEngine({ onRecord, memoryQuery, memoryLimit, includeMemoryBoard } = {}) {
  const cse = new ConstitutionalStateEngine({ onRecord });
  const ckl = await ConstitutionalKnowledgeLayer.loadDefault(fetch);
  const gk = new GovernanceKernel({ ckl });
  const isl = createIslEngine();
  const intents = new IntentService();
  const evidence = new EvidenceService();
  const memory = createJarvisMemoryClient({ fetch });
  const session = await createJarvisSession(memory, {
    query: memoryQuery,
    limit: memoryLimit,
    includeBoard: includeMemoryBoard ?? true,
  });
  const orchestrator = new ExecutionOrchestrator({ gk, cse });
  const replay = new ReplayService(cse);
  const scene = new SceneGraph();
  const provenance = new ProvenanceRecorder();
  const cssv = new CssvRegistry({ host: new BrowserCssvHost(), persist: false });
  const cssvSyncUrl =
    typeof window !== "undefined"
      ? window.__CSSV_SYNC_URL ?? "http://localhost:3000/ingest"
      : null;

  const worldRes = await fetch("demo/worlds/mythar_plains.world.json");
  if (!worldRes.ok) throw new Error("Failed to load governed world");
  const world = await worldRes.json();
  scene.loadWorld(world);
  cssv.registerArtifact({
    id: world.id,
    artifactType: "world",
    dto: "GovernedWorldDto",
    payload: world,
  });

  const tlRes = await fetch("demo/timelines/opening_4d_reveal.timeline.json");
  if (!tlRes.ok) throw new Error("Failed to load cinematic timeline");
  const timeline = await tlRes.json();
  const timelinePlayer = new TimelinePlayer(timeline);
  cssv.registerArtifact({
    id: timeline.id,
    artifactType: "timeline",
    dto: "GovernedTimelineDto",
    payload: timeline,
  });

  const ascRes = await fetch("demo/timelines/mythar_ascension.timeline.json");
  if (!ascRes.ok) throw new Error("Failed to load Mythar Ascension timeline");
  const ascensionTimeline = await ascRes.json();
  cssv.registerArtifact({
    id: ascensionTimeline.id,
    artifactType: "timeline",
    dto: "GovernedTimelineDto",
    payload: ascensionTimeline,
  });

  return {
    charter: CHARTER,
    cse,
    ckl,
    gk,
    isl,
    islOpeningScript: ISL_OPENING_4D_REVEAL,
    islAscensionScript: ISL_MYTHAR_ASCENSION,
    intents,
    evidence,
    memory,
    session,
    orchestrator,
    replay,
    scene,
    world,
    timeline,
    timelinePlayer,
    ascensionTimeline,
    provenance,
    cssv,
    cssvSyncUrl,
    /** Switch active timeline JSON into the player (Option B: JSON is SoT). */
    loadTimeline(tl) {
      timelinePlayer.timeline = tl;
      timelinePlayer.durationSec = tl.durationSec ?? 12;
      timelinePlayer.reset();
    },
  };
}
