/**
 * Assemble and run the tiny constitutional universe.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONSTITUTION } from "./constitution.mjs";
import { createInitialCertifiedState, freezeCertifiedSnapshot, loadSliceInto, sliceHashFromCache } from "./certified-state.mjs";
import { createChamber, evolveTo, proposeIllegalMassInjection, commitProposal } from "./simulation-chamber.mjs";
import { createImage, projectCertified, imageToPpm } from "./mandala-project.mjs";
import { defaultFlythroughPath, setObserverPath, observerAt } from "./movie-lane.mjs";
import { frameReceipt } from "./provenance.mjs";
import { ORGAN_MAP } from "./organs.mjs";
import { probeAndCompareGradient } from "./backend/gpu-contract.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");

export function storyForgeIntent({ seed = 7 } = {}) {
  return {
    organ: "StoryForge",
    constitutionId: DEFAULT_CONSTITUTION.id,
    seed,
    narrative: "one rupture in a 32³ lattice; lawful transport; observer flythrough",
    worldLaw: DEFAULT_CONSTITUTION.invariant.statement,
  };
}

export function runTinyUniverse({
  seed = 7,
  tEnd = 63,
  outDir = join(REPO_ROOT, "output/mandala-proto"),
  tryGpu = true,
} = {}) {
  const intent = storyForgeIntent({ seed });
  const constitution = DEFAULT_CONSTITUTION;
  const state = createInitialCertifiedState({ constitution, seed });
  const chamber = createChamber(constitution);
  const receipts = [
    frameReceipt({
      state,
      constitution,
      observer: state.observer,
      rule: "initial-certified",
      extra: { intent },
    }),
  ];

  const steps = evolveTo(chamber, state, tEnd);
  for (const s of steps) {
    receipts.push(
      frameReceipt({
        state,
        constitution,
        decision: s.decision,
        rule: "chamber-step",
        extra: { committed: s.committed },
      }),
    );
    if (!s.committed) break;
  }

  const path = defaultFlythroughPath(state.temporal.filled, state.shape);
  setObserverPath(state, path);

  const tView = Math.min(40, state.temporal.filled - 1);
  const reconstructed = observerAt(state, tView);
  const hashAtView = sliceHashFromCache(state, tView);

  const liveHashBefore = state.hash;
  const image = createImage(64, 64);
  const proj = projectCertified(state, image);
  const liveHashAfter = state.hash;

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `frame-t${state.t}.ppm`), imageToPpm(image));

  const gpu = tryGpu
    ? probeAndCompareGradient({
        scalar: state.scalar,
        shape: state.shape,
        repoRoot: REPO_ROOT,
        outDir,
      })
    : { status: "skipped", reason: "tryGpu=false" };

  const snapshot = freezeCertifiedSnapshot(state);
  writeFileSync(
    join(outDir, "receipt.json"),
    JSON.stringify(
      {
        product: "governed-synthetic-world-runtime",
        organs: ORGAN_MAP,
        constitutionId: constitution.id,
        seed,
        tEnd: state.t,
        filled: state.temporal.filled,
        liveHash: state.hash,
        snapshotHash: snapshot.hash,
        reconstructed,
        hashAtView,
        renderDidNotMutate: liveHashBefore === liveHashAfter,
        gpu,
        lastReceipt: receipts[receipts.length - 1],
      },
      null,
      2,
    ),
  );

  return {
    state,
    constitution,
    receipts,
    gpu,
    liveHashBefore,
    liveHashAfter,
    hashAtView,
    reconstructed,
    outDir,
    image,
    proj,
    proposeIllegal: () => proposeIllegalMassInjection(state, constitution),
    commit: (proposal) => commitProposal(state, proposal, constitution),
    loadSlice: (t) => loadSliceInto(state, t),
  };
}

export { DEFAULT_CONSTITUTION };
