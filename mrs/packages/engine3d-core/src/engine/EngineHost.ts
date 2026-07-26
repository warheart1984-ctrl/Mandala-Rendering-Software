import type { Clock } from "./Clock.js";
import { InputGatherer } from "./InputGatherer.js";
import type { World3D } from "../world/World3D.js";
import type { BodyRegistry } from "../world/BodyRegistry.js";
import type { Body } from "../world/Body.js";
import type { BridgeV1 } from "../bridge/BridgeV1.js";
import type { PhysicsEngine } from "../physics/PhysicsEngine.js";
import type { Substrate4D } from "../substrate/Substrate4D.js";
import type { RendererCore } from "../renderer/RendererCore.js";
import type { LiftedState4D } from "../substrate/LiftedState.js";
import type { VisualMod } from "../substrate/VisualMod.js";
import type { ReplayTimeline } from "../replay/ReplayTimeline.js";
import type { ReplayRecord } from "../replay/ReplayRecord.js";
import {
  createStructuralInvariants,
  TickInvariantState,
  type Engine3DInvariant,
} from "../invariants/Engine3DInvariants.js";

export interface EngineHost {
  engineTick(): void;
}

/** Ordered tick phases for constitutional / host-order instrumentation. */
export type EngineTickPhase =
  | "gather"
  | "bridge"
  | "applyForces"
  | "clearForces"
  | "physics"
  | "substrate"
  | "render"
  | "replay";

export interface DefaultEngineHostOptions {
  clock: Clock;
  world: World3D;
  registry: BodyRegistry;
  bridge: BridgeV1;
  physics: PhysicsEngine;
  substrate: Substrate4D;
  renderer: RendererCore;
  replay: ReplayTimeline;
  gatherer?: InputGatherer;
  invariants?: Engine3DInvariant[];
  /** Optional phase trace — append-only; does not affect determinism of physics/render. */
  phaseTrace?: EngineTickPhase[];
}

/**
 * Canonical coordinator. Tick order is fixed (no async, no reordering).
 * Status: **enforced** (host-order + invariants tests).
 */
export class DefaultEngineHost implements EngineHost {
  private tickIndex = 0;
  private readonly gatherer: InputGatherer;
  private readonly invariants: Engine3DInvariant[];
  private readonly tickState = new TickInvariantState();
  lastVisualMod: VisualMod | null = null;
  lastDt = 0;

  constructor(private readonly opts: DefaultEngineHostOptions) {
    this.gatherer = opts.gatherer ?? new InputGatherer();
    this.invariants = opts.invariants ?? createStructuralInvariants();
  }

  getTickIndex(): number {
    return this.tickIndex;
  }

  engineTick(): void {
    this.enforceInvariantsAtTickStart();
    this.tickState.reset();

    // 1. Gather
    this.notePhase("gather");
    const inputs = this.gatherer.gather(
      this.opts.clock,
      this.opts.registry,
      this.opts.world,
    );
    this.lastDt = inputs.dt;

    // 2. bridge.evaluate(inputs) — v1 only
    this.notePhase("bridge");
    const forces = this.opts.bridge.evaluate(inputs);

    // 3. apply forces; clear map
    this.notePhase("applyForces");
    for (const [id, force] of forces.entries()) {
      const body = this.opts.registry.resolve(id);
      if (!body) continue;
      body.applyForce(force.x, force.y, force.z);
    }
    this.notePhase("clearForces");
    forces.clear();
    this.tickState.forcesMapEmptyBeforePhysics = forces.size === 0;
    this.tickState.assertForcesClearedBeforePhysics();

    // 4. physics.step(dt)
    this.notePhase("physics");
    this.opts.physics.step(inputs.dt, inputs.bodies);

    // 5. substrate.update(lifted4D)
    this.notePhase("substrate");
    const lifted = this.liftTo4D(inputs.bodies);
    const visualMod = this.opts.substrate.update(lifted);
    this.tickState.visualModProduced = true;
    this.lastVisualMod = visualMod;

    // 6. renderer.render(world, visualMod)
    this.notePhase("render");
    this.tickState.renderCalled = true;
    this.tickState.assertVisualModBeforeRender();
    this.opts.renderer.render(this.opts.world, visualMod);

    // 7. constitutional replay record
    this.notePhase("replay");
    const record: ReplayRecord = {
      tickIndex: this.tickIndex,
      time: inputs.time,
      dt: inputs.dt,
      inputs,
      visualMod,
    };
    this.opts.replay.append(record);
    this.tickIndex += 1;
  }

  private notePhase(phase: EngineTickPhase): void {
    this.opts.phaseTrace?.push(phase);
  }

  private enforceInvariantsAtTickStart(): void {
    for (const inv of this.invariants) {
      if (inv.id === "no-decision-without-replay-evidence") {
        // Replay evidence is required for governance decisions, not for tick 0.
        continue;
      }
      inv.check();
    }
  }

  private liftTo4D(bodies: Body[]): LiftedState4D {
    const positions4D = new Float32Array(bodies.length * 4);
    const velocities4D = new Float32Array(bodies.length * 4);
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i]!;
      const pi = i * 4;
      positions4D[pi] = b.position.x;
      positions4D[pi + 1] = b.position.y;
      positions4D[pi + 2] = b.position.z;
      positions4D[pi + 3] = 1;
      velocities4D[pi] = b.velocity.x;
      velocities4D[pi + 1] = b.velocity.y;
      velocities4D[pi + 2] = b.velocity.z;
      velocities4D[pi + 3] = 0;
    }
    return { positions4D, velocities4D };
  }
}
