#!/usr/bin/env node
/**
 * Minimal Mandala Engine editor — CLI (roadmap v0.8).
 * Lists temporal slices, scrubs t from certified cache, shows hash.
 * Cannot edit physics without a proposal. --organ switches observation organ (stub).
 * Status: **partial**. Not Unreal Editor. Live shader reload: blocked (use --organ).
 */

import { createUniverse, stepPhysics, observe, ORGAN_ABI_V1 } from "../sdk/index.mjs";
import { loadSliceInto, sliceHashFromCache } from "../../proto/certified-state.mjs";
import { ORGAN_TAG_SET } from "../organs.mjs";

export const EDITOR_STATUS = "partial";

export function parseEditorArgs(argv) {
  const args = argv.slice(2);
  const out = {
    command: "help",
    seed: 7,
    steps: 4,
    t: 0,
    organ: "MovieLane",
    propose: false,
  };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--seed" && args[i + 1]) out.seed = Number(args[++i]);
    else if (a === "--steps" && args[i + 1]) out.steps = Number(args[++i]);
    else if (a === "--t" && args[i + 1]) out.t = Number(args[++i]);
    else if (a === "--organ" && args[i + 1]) {
      out.organ = args[++i];
      if (!positional.length) out.command = "organ";
    } else if (a === "--propose") out.propose = true;
    else if (!String(a).startsWith("--")) positional.push(a);
  }
  if (positional[0]) out.command = positional[0];
  return out;
}

export function evolveForEditor({ seed, steps }) {
  const universe = createUniverse({ seed });
  for (let i = 0; i < steps; i++) {
    const r = stepPhysics(universe);
    if (!r.committed) break;
  }
  return universe;
}

export function listSlices(universe) {
  const rows = [];
  for (let t = 0; t < universe.state.temporal.filled; t++) {
    rows.push({ t, hash: sliceHashFromCache(universe.state, t) });
  }
  return rows;
}

export function scrub(universe, t) {
  loadSliceInto(universe.state, t);
  const view = observe(universe, t);
  return {
    t: universe.state.t,
    hash: universe.state.hash,
    observer: view.observer,
    ownsTime: false,
    reSimulatedFromZero: false,
  };
}

export function refusePhysicsEdit({ propose }) {
  if (!propose) {
    return {
      ok: false,
      code: "physics-edit-requires-proposal",
      detail: "Editor cannot write φ / defect. SimulationChamber must propose; AAIS commits.",
    };
  }
  return {
    ok: false,
    code: "proposal-required-from-chamber",
    detail: "--propose acknowledges intent, but this CLI does not mint physics deltas. Use SDK propose() from SimulationChamber.",
  };
}

export function switchOrgan(name) {
  if (!ORGAN_TAG_SET.has(name)) {
    throw new Error(`unknown organ: ${name}`);
  }
  return {
    organ: name,
    liveShaderReload: "blocked-with-evidence",
    note: "Full live reload is not implemented. --organ selects which organ the editor is inspecting.",
    abiId: ORGAN_ABI_V1.abiId,
  };
}

export function runEditor(opts) {
  if (opts.command === "help" || opts.command === "-h") {
    return {
      status: EDITOR_STATUS,
      usage: [
        "node mandala/engine/editor/cli.mjs list [--seed N] [--steps N]",
        "node mandala/engine/editor/cli.mjs scrub --t K [--seed N] [--steps N]",
        "node mandala/engine/editor/cli.mjs hash [--seed N] [--steps N]",
        "node mandala/engine/editor/cli.mjs --organ MovieLane",
        "node mandala/engine/editor/cli.mjs set-phi   # refused without Chamber proposal",
      ],
    };
  }
  if (opts.command === "set-phi" || opts.command === "edit-physics") {
    return refusePhysicsEdit(opts);
  }
  if (opts.command === "organ") {
    return switchOrgan(opts.organ);
  }
  const universe = evolveForEditor(opts);
  if (opts.command === "list") {
    return { slices: listSlices(universe), abiId: ORGAN_ABI_V1.abiId, seed: opts.seed };
  }
  if (opts.command === "hash") {
    return {
      t: universe.state.t,
      hash: universe.state.hash,
      constitutionId: universe.state.constitutionId,
      seed: universe.state.seed,
    };
  }
  if (opts.command === "scrub") {
    return scrub(universe, opts.t);
  }
  return { error: `unknown command ${opts.command}` };
}

const isMain = process.argv[1] && String(process.argv[1]).replace(/\\/g, "/").endsWith("editor/cli.mjs");
if (isMain) {
  const result = runEditor(parseEditorArgs(process.argv));
  console.log(JSON.stringify(result, null, 2));
}
