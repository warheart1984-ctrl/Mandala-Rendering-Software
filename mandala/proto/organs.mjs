/**
 * Organ Map — do not invent organs.
 * Status tags are honest: only the proto-wired organs are partial/enforced.
 */

export const ORGAN_MAP = Object.freeze({
  StoryForge: {
    responsibility: "Intent, narrative constraints, world law declarations",
    status: "partial",
    proto: "supplies constitution id, seed, initial defect placement",
  },
  SimulationChamber: {
    responsibility: "Evolves certified spacetime state",
    status: "partial",
    proto: "mandala/proto/simulation-chamber.mjs — not scripts/simulation-chamber.mjs (still pose-interp)",
  },
  Mandala: {
    responsibility: "Geometry, fields, visibility and projection",
    status: "partial",
    proto: "projects frozen certified snapshots; does not define reality",
  },
  AIPainter: {
    responsibility: "Appearance synthesis under state constraints",
    status: "partial",
    proto: "engine CPU field-tint painter; Lemonade SD :13307 attempted with evidence; cannot commit physics",
  },
  Mythar: {
    responsibility: "Acoustic field and speech realization",
    status: "partial",
    proto: "engine sound lattice from η/|∇φ|; edge-tts caption if present; valid WAV ≠ perceptual proof",
  },
  AAIS: {
    responsibility: "Invariant enforcement, provenance, arbitration",
    status: "partial",
    proto: "one invariant (scalar mass); full arbitration declared",
  },
  MovieLane: {
    responsibility: "Observation path, editing and temporal projection",
    status: "partial",
    proto: "samples certified t; does not own time",
  },
});
