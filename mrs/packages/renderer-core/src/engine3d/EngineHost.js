import { EngineClock, FIXED_DT, PhysicsWorld3D } from "../math3d/physics.js";
import { WaveBridge } from "../bridge/bridge-contract.js";
import { createWaveField3D } from "../bridge/wave-field-3d.js";
import { World3D } from "./World3D.js";
import { Substrate4DStub } from "./Substrate4DStub.js";
import { Renderer3DStub } from "./Renderer3DStub.js";

/**
 * Living demo host: 3D world → BridgeContract **v1** → physics + stubs.
 *
 * Locked frame order (exact — do not reorder):
 * ```
 * 1. gather BridgeInputs3D { time, deltaTime, bodies, geometryVertices: world.mesh.vertices }
 * 2. outputs = bridge.evaluate(inputs)
 * 3. for ([body, force] of forces) body.applyForce(force.x, force.y, force.z)
 * 4. physics.step(dt)
 * 5. substrate.update(outputs.lifted4D)
 * 6. renderer.render(world, outputs.visualMod)
 * ```
 *
 * Status: **partial** — Node/browser demo loop only. Not Unreal parity, not a
 * full game engine, not Genblaze/RT4D live path. v2–v6 bridges are unused.
 *
 * Note: WaveBridge v1 stores forces as Map<body.id, Vec3>. EngineHost resolves
 * those onto stable World3D body refs so step 3 matches the locked
 * `for ([body, force] of …)` shape. evaluate() also calls applyWaveForceToBody
 * as a side effect; we clear accumulators before step 3 so forces are applied
 * exactly once in the locked order.
 */

/**
 * Resolve v1 Map<id, Vec3> onto Map<Body3D, Vec3> using World3D stable refs.
 * @param {World3D} world
 * @param {Map<string|number, { x: number, y: number, z: number }>} forcesById
 * @returns {Map<object, { x: number, y: number, z: number }>}
 */
export function resolveForcesByBody(world, forcesById) {
  /** @type {Map<object, { x: number, y: number, z: number }>} */
  const byBody = new Map();
  for (const body of world.bodies) {
    const key = body.id;
    if (key == null || !forcesById.has(key)) continue;
    byBody.set(body, forcesById.get(key));
  }
  return byBody;
}

/**
 * Step 3 — apply wave forces to 3D physics (locked order).
 * Clears accumulators first to undo evaluate's side-effect apply.
 *
 * @param {World3D} world
 * @param {Map<string|number, { x: number, y: number, z: number }>} forcesById
 * @returns {number}
 */
export function applyForcesFromBridgeOutputs(world, forcesById) {
  const forces = resolveForcesByBody(world, forcesById);
  world.clearForces();
  let applied = 0;
  for (const [body, force] of forces.entries()) {
    body.applyForce(force.x, force.y, force.z);
    applied += 1;
  }
  return applied;
}

/**
 * Thin clock facade matching the locked loop: clock.time / clock.deltaTime().
 * Wraps math3d EngineClock; does not replace it.
 */
export class LoopClock {
  /**
   * @param {EngineClock} [inner]
   * @param {number} [fixedDelta]
   */
  constructor(inner, fixedDelta = FIXED_DT) {
    this._inner = inner ?? new EngineClock({ fixedDelta });
    this._lastDelta = this._inner.fixedDelta;
  }

  get fixedDelta() {
    return this._inner.fixedDelta;
  }

  get elapsed() {
    return this._inner.elapsed;
  }

  /** Locked loop: clock.time */
  get time() {
    return this._inner.elapsed;
  }

  /** Locked loop: clock.deltaTime() — last consumed / fixed step. */
  deltaTime() {
    return this._lastDelta;
  }

  /**
   * @param {number} deltaSeconds
   * @param {(dt: number) => void} step
   */
  advance(deltaSeconds, step) {
    return this._inner.advance(deltaSeconds, (dt) => {
      this._lastDelta = dt;
      step(dt);
    });
  }

  reset() {
    this._lastDelta = this._inner.fixedDelta;
    this._inner.reset();
  }
}

/**
 * @param {object} [options]
 * @param {World3D} [options.world]
 * @param {import("../bridge/wave-field-3d.js").WaveField3D} [options.field]
 * @param {WaveBridge} [options.bridge]
 * @param {number} [options.alphaLift]
 * @param {number} [options.kForce]
 * @param {number} [options.ampVisual]
 * @param {EngineClock|LoopClock} [options.clock]
 * @param {PhysicsWorld3D} [options.physics]
 * @param {Substrate4DStub} [options.substrate]
 * @param {Renderer3DStub} [options.renderer]
 * @param {number} [options.fixedDelta]
 */
export class EngineHost {
  constructor(options = {}) {
    this.world = options.world ?? new World3D();
    this.field =
      options.field ??
      createWaveField3D({
        nx: 8,
        ny: 8,
        nz: 8,
        dx: 1,
        c: 1,
        dt: options.fixedDelta ?? FIXED_DT,
      });
    this.bridge =
      options.bridge ??
      new WaveBridge(
        this.field,
        options.alphaLift ?? 1,
        options.kForce ?? 1,
        options.ampVisual ?? 1,
      );

    if (options.clock instanceof LoopClock) {
      this.clock = options.clock;
    } else if (options.clock) {
      this.clock = new LoopClock(options.clock, options.fixedDelta ?? FIXED_DT);
    } else {
      this.clock = new LoopClock(
        new EngineClock({ fixedDelta: options.fixedDelta ?? FIXED_DT }),
        options.fixedDelta ?? FIXED_DT,
      );
    }

    this.physics =
      options.physics ??
      new PhysicsWorld3D({
        gravity: { x: 0, y: 0, z: 0 },
        damping: 1,
      });
    this.substrate = options.substrate ?? new Substrate4DStub();
    this.renderer = options.renderer ?? new Renderer3DStub();

    this.frameIndex = 0;
    this.lastOutputs = null;
    this.lastForcesApplied = 0;
    this._running = false;
    this._rafId = null;
    this._lastWallMs = null;
    this._syncPhysicsBodies();
  }

  _syncPhysicsBodies() {
    this.physics.bodies.length = 0;
    for (const body of this.world.bodies) {
      this.physics.bodies.push(body);
    }
  }

  /**
   * Locked engine frame — exact order from the user contract.
   * @param {number} [dtOverride] When omitted, uses clock.deltaTime().
   */
  engineTick(dtOverride) {
    this._syncPhysicsBodies();

    // dt = clock.deltaTime()
    const dt = dtOverride ?? this.clock.deltaTime();

    // 1. Gather 3D world state
    const inputs = {
      time: this.clock.time,
      deltaTime: dt,
      bodies: this.world.bodies,
      geometryVertices: this.world.mesh.vertices,
    };

    // 2. Bridge evaluation (3D → 4D) — WaveBridge v1 only
    const outputs = this.bridge.evaluate(inputs);

    // 3. Apply wave forces to 3D physics
    //    v1 Map is id-keyed; resolve onto body refs to match
    //    for (const [body, force] of outputs.forces.entries())
    const forceByBody = resolveForcesByBody(this.world, outputs.forces);
    this.world.clearForces(); // undo evaluate side-effect so step 3 is sole apply
    let applied = 0;
    for (const [body, force] of forceByBody.entries()) {
      body.applyForce(force.x, force.y, force.z);
      applied += 1;
    }
    this.lastForcesApplied = applied;

    // 4. Step 3D physics
    this.physics.step(dt);

    // 5. Send lifted 4D coords to 4D substrate
    this.substrate.update(outputs.lifted4D);

    // 6. Render 3D with visual modulation
    this.renderer.render(this.world, outputs.visualMod);

    this.lastOutputs = outputs;
    this.frameIndex += 1;
    return outputs;
  }

  /**
   * Advance wall/sim time through fixed steps; each step runs engineTick.
   * @param {number} deltaSeconds
   */
  advance(deltaSeconds) {
    return this.clock.advance(deltaSeconds, (dt) => {
      this.engineTick(dt);
    });
  }

  /**
   * Deterministic Node/test helper: run N fixed frames.
   * @param {number} n
   * @param {number} [dt]
   */
  runFrames(n, dt = this.clock.fixedDelta) {
    const count = Math.max(0, Math.floor(n));
    for (let i = 0; i < count; i++) {
      this.clock.advance(dt, (stepDt) => {
        this.engineTick(stepDt);
      });
    }
    return this.summary();
  }

  /**
   * Browser loop: requestAnimationFrame → advance → engineTick (locked order).
   */
  start() {
    if (this._running) return;
    const raf =
      typeof globalThis.requestAnimationFrame === "function"
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : null;
    if (!raf) {
      throw new Error(
        "EngineHost.start() requires requestAnimationFrame; use runFrames/engineTick in Node",
      );
    }
    this._running = true;
    this._lastWallMs = null;
    const engineLoop = (now) => {
      if (!this._running) return;
      if (this._lastWallMs == null) this._lastWallMs = now;
      const delta = (now - this._lastWallMs) / 1000;
      this._lastWallMs = now;
      // Fixed-step via clock.advance → engineTick (locked 1–6)
      this.advance(delta);
      this._rafId = raf(engineLoop);
    };
    this._rafId = raf(engineLoop);
  }

  stop() {
    this._running = false;
    if (
      this._rafId != null &&
      typeof globalThis.cancelAnimationFrame === "function"
    ) {
      globalThis.cancelAnimationFrame(this._rafId);
    }
    this._rafId = null;
    this._lastWallMs = null;
  }

  summary() {
    return {
      status: "partial",
      bridge: "v1",
      frameIndex: this.frameIndex,
      elapsed: this.clock.time,
      bodyCount: this.world.bodies.length,
      vertexCount: this.world.mesh.vertices.length,
      forcesAppliedLast: this.lastForcesApplied,
      lifted4DLength: this.substrate.lastLifted4D.length,
      visualModLength: this.lastOutputs?.visualMod?.length ?? 0,
      renderCount: this.renderer.renderCount,
      substrateUpdates: this.substrate.updateCount,
    };
  }
}
