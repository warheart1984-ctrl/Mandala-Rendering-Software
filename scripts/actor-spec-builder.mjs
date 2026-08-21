#!/usr/bin/env node
/**
 * Actor Spec Builder — translates scene card actors into AI Factory build specs.
 *
 * Maps:
 *   scene card actor → AI Factory AIBuildSpec
 *   personality → spine profile (risk, capabilities, speaking mode)
 *   color/emotion → mood/behavior constraints
 *
 * Usage:
 *   node actor-spec-builder.mjs <scene-card.json> [--output-dir <dir>]
 *
 * Outputs:
 *   <output-dir>/<actor-id>-spec.json  — AI Factory build spec
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Personality traits → AI Factory spec mapping.
 * Maps natural language personality descriptions to structured capabilities.
 */
const PERSONALITY_MAP = {
  bold:     { risk: "medium", lobes: ["cognitive.attention", "cognitive.planning", "cognitive.execution", "speaking.runtime"], speaking: "governed", agency: true },
  cautious: { risk: "low",    lobes: ["cognitive.attention", "cognitive.memory", "cognitive.deliberation", "speaking.runtime"], speaking: "governed", agency: true },
  wise:     { risk: "low",    lobes: ["cognitive.attention", "cognitive.memory", "cognitive.reflection", "speaking.runtime"], speaking: "governed", agency: true },
  aggressive:{ risk: "high",  lobes: ["cognitive.attention", "cognitive.planning", "cognitive.execution", "speaking.runtime"], speaking: "governed", agency: true },
  calm:     { risk: "low",    lobes: ["cognitive.attention", "cognitive.memory", "speaking.runtime"], speaking: "governed", agency: false },
  curious:  { risk: "medium", lobes: ["cognitive.attention", "cognitive.planning", "cognitive.execution", "speaking.runtime"], speaking: "governed", agency: true },
};

function inferPersonalityTraits(personalityText) {
  const text = personalityText.toLowerCase();
  const traits = [];

  // Detect personality keywords
  if (text.includes("bold") || text.includes("confident") || text.includes("draws others")) traits.push("bold");
  if (text.includes("cautious") || text.includes("analytical") || text.includes("question")) traits.push("cautious");
  if (text.includes("wise") || text.includes("quiet") || text.includes("memory") || text.includes("remembers")) traits.push("wise");
  if (text.includes("aggressive") || text.includes("fierce") || text.includes("violent")) traits.push("aggressive");
  if (text.includes("calm") || text.includes("serene") || text.includes("peaceful")) traits.push("calm");
  if (text.includes("curious") || text.includes("wonder") || text.includes("explores")) traits.push("curious");

  // Default to curious if nothing detected
  if (traits.length === 0) traits.push("curious");
  return traits;
}

function buildActorSpec(actorDef, sceneCard) {
  const traits = inferPersonalityTraits(actorDef.personality || "");
  const primaryTrait = traits[0];
  const profile = PERSONALITY_MAP[primaryTrait] || PERSONALITY_MAP.curious;

  // Build ID from actor ID + scene ID
  const buildId = `actor-${actorDef.id}-${sceneCard.id || "unknown"}`;

  // Content hash for determinism
  const specHash = createHash("sha256")
    .update(JSON.stringify({ actor: actorDef.id, scene: sceneCard.id, personality: actorDef.personality }))
    .digest("hex")
    .slice(0, 16);

  return {
    spec_version: "ai_factory.ai_build_spec.v1",
    build_id: buildId,
    intent_summary: `Actor "${actorDef.name || actorDef.id}" for scene "${sceneCard.name || sceneCard.id}": ${actorDef.personality || "no personality defined"}`,
    risk_level: profile.risk,
    capabilities: {
      enabled_lobes: profile.lobes,
      compose_mode: "fast",
    },
    prohibitions: {
      forbidden_tools: profile.risk === "high" ? ["file_write", "network_access"] : [],
      high_impact_actions_blocked: true,
    },
    oversight: {
      require_speaking: true,
      require_agency_check: profile.agency,
      require_generation_gate: true,
    },
    data_sensitivity: "operator",
    interfaces: {
      face_id: actorDef.id,
      speaking_mode: profile.speaking,
    },
    tools_allowed: [],

    // Actor-specific metadata (not part of standard AI Factory spec)
    _actor: {
      id: actorDef.id,
      name: actorDef.name || actorDef.id,
      personality: actorDef.personality || "",
      color: actorDef.color || "#ffffff",
      voice: actorDef.voice || "shimmer",
      avatarRadius: actorDef.avatarRadius || 0.4,
      detected_traits: traits,
      personality_profile: primaryTrait,
      beat_count: (actorDef.beats || []).length,
    },

    _content_hash: specHash,
  };
}

// CLI
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node actor-spec-builder.mjs <scene-card.json> [--output-dir <dir>]");
  process.exit(1);
}

const sceneCardPath = resolve(args[0]);
let outputDir = resolve(__dirname, "../output/actor-specs");

for (let i = 1; i < args.length; i++) {
  if (args[i] === "--output-dir" && args[i + 1]) outputDir = resolve(args[++i]);
}

const raw = readFileSync(sceneCardPath, "utf8");
const sceneCard = JSON.parse(raw);
const actors = sceneCard.actors || [];

if (actors.length === 0) {
  console.log("  No actors in scene card. Nothing to build.");
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });

console.log(`\nActor Spec Builder — "${sceneCard.name || sceneCard.id}"`);
console.log("=".repeat(50));

for (const actorDef of actors) {
  const spec = buildActorSpec(actorDef, sceneCard);
  const outPath = resolve(outputDir, `${actorDef.id}-spec.json`);
  writeFileSync(outPath, JSON.stringify(spec, null, 2));

  console.log(`  ${actorDef.id}:`);
  console.log(`    Name: ${actorDef.name}`);
  console.log(`    Personality: ${(actorDef.personality || "none").slice(0, 60)}`);
  console.log(`    Traits: ${spec._actor.detected_traits.join(", ")}`);
  console.log(`    Profile: ${spec._actor.personality_profile} (risk: ${spec.risk_level})`);
  console.log(`    Lobes: ${spec.capabilities.enabled_lobes.join(", ")}`);
  console.log(`    Voice: ${actorDef.voice || "shimmer"}`);
  console.log(`    Spec: ${outPath}`);
}

console.log(`\n  Built ${actors.length} actor specs → ${outputDir}`);
