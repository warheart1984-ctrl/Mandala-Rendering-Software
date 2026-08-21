/**
 * Closed organ tags for Mandala Engine graph nodes.
 * Same keys as mandala/proto/organs.mjs — do not invent organs.
 */

export const ORGAN_TAGS = Object.freeze([
  "StoryForge",
  "SimulationChamber",
  "Mandala",
  "AIPainter",
  "Mythar",
  "AAIS",
  "MovieLane",
]);

export const ORGAN_TAG_SET = new Set(ORGAN_TAGS);

export const NODE_KINDS = Object.freeze([
  "intent",
  "simulationDomain",
  "observation",
  "projection",
  "gate",
  "appearance",
  "acoustic",
  "eventSurface",
]);

export const NODE_KIND_SET = new Set(NODE_KINDS);

export const DEFAULT_KIND_FOR_ORGAN = Object.freeze({
  StoryForge: "intent",
  SimulationChamber: "simulationDomain",
  Mandala: "projection",
  AIPainter: "appearance",
  Mythar: "acoustic",
  AAIS: "gate",
  MovieLane: "observation",
});
