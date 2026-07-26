import type { ReplayTimeline } from "../replay/ReplayTimeline.js";

export interface Engine3DInvariant {
  readonly id: string;
  readonly description: string;
  check(): void;
}

/**
 * Tick-local state used for REAL runtime checks inside EngineHost.
 */
export class TickInvariantState {
  forcesMapEmptyBeforePhysics = false;
  visualModProduced = false;
  renderCalled = false;

  reset(): void {
    this.forcesMapEmptyBeforePhysics = false;
    this.visualModProduced = false;
    this.renderCalled = false;
  }

  assertForcesClearedBeforePhysics(): void {
    if (!this.forcesMapEmptyBeforePhysics) {
      throw new Error(
        "Invariant violation: forces map not cleared before physics.step",
      );
    }
  }

  assertVisualModBeforeRender(): void {
    if (this.renderCalled && !this.visualModProduced) {
      throw new Error(
        "Invariant violation: renderer.render called before substrate VisualMod this tick",
      );
    }
  }
}

export function createStructuralInvariants(): Engine3DInvariant[] {
  return [
    {
      id: "no-decision-without-inputs",
      description:
        "Bridge evaluation must only occur after inputs are fully gathered. Structurally enforced by EngineHost sequence.",
      check: () => {
        // Structurally enforced by EngineHost sequence — no runtime assertion.
      },
    },
    {
      id: "no-force-without-body",
      description:
        "No force may be applied to a non-existent body. Structurally enforced by EngineHost sequence (registry.resolve guard).",
      check: () => {
        // Structurally enforced by EngineHost sequence — no runtime assertion.
      },
    },
    {
      id: "no-physics-without-forces-cleared",
      description:
        "Forces map must be cleared after application before physics step. Runtime-enforced via TickInvariantState when host marks clearance.",
      check: () => {
        // Host calls TickInvariantState.assertForcesClearedBeforePhysics at step 4.
      },
    },
    {
      id: "no-render-without-substrate",
      description:
        "Renderer must only render after substrate has produced VisualMod. Runtime-enforced via TickInvariantState when host marks VisualMod.",
      check: () => {
        // Host marks visualModProduced before render.
      },
    },
    {
      id: "deterministic-tick-order",
      description:
        "Engine tick must follow the exact six-stage sequence. Structurally enforced by EngineHost sequence.",
      check: () => {
        // Structurally enforced by EngineHost sequence — no runtime assertion.
      },
    },
  ];
}

export function createReplayEvidenceInvariant(
  replay: ReplayTimeline,
): Engine3DInvariant {
  return {
    id: "no-decision-without-replay-evidence",
    description:
      "Any governance decision derived from Engine3D must reference a concrete replay record.",
    check: () => {
      if (replay.length() === 0) {
        throw new Error(
          "Invariant violation: governance decision requested with no replay evidence.",
        );
      }
    },
  };
}

export function createEngine3DInvariants(
  replay: ReplayTimeline,
): Engine3DInvariant[] {
  return [...createStructuralInvariants(), createReplayEvidenceInvariant(replay)];
}

/** Catalog used by tests; structural checks are honest no-ops. */
export const Engine3DInvariants: Engine3DInvariant[] = createStructuralInvariants();
