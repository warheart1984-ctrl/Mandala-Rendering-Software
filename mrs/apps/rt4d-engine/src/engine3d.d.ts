declare module "@mrs/renderer-core/engine3d" {
  export interface Vec3Like {
    x: number;
    y: number;
    z: number;
  }

  export interface Body3D {
    id: number | string;
    position: Vec3Like & { w?: number };
    forceAccum: Vec3Like;
  }

  export interface MeshLike {
    vertices: unknown[];
  }

  export interface World3D {
    bodies: Body3D[];
    mesh: MeshLike;
    addBody(opts: { position: Vec3Like }): Body3D;
    clearForces(): void;
  }

  export interface ClockLike {
    fixedDelta: number;
    elapsed: number;
    time: number;
    deltaTime(): number;
  }

  export interface EngineHost {
    world: World3D;
    clock: ClockLike;
    frameIndex: number;
    engineTick(dt?: number): unknown;
    runFrames(n: number, dt?: number): unknown;
    summary(): Record<string, unknown>;
  }

  export declare class LoopClock implements ClockLike {
    constructor(inner?: unknown, fixedDelta?: number);
    fixedDelta: number;
    elapsed: number;
    time: number;
    deltaTime(): number;
    advance(deltaSeconds: number, step: (dt: number) => void): void;
    reset(): void;
  }

  export declare class World3D {
    constructor();
    bodies: Body3D[];
    mesh: MeshLike;
    addBody(opts: { position: Vec3Like }): Body3D;
    clearForces(): void;
  }

  export declare class EngineHost {
    constructor(options?: {
      world?: World3D;
      fixedDelta?: number;
      clock?: LoopClock | ClockLike;
    });
    world: World3D;
    clock: ClockLike;
    frameIndex: number;
    engineTick(dt?: number): unknown;
    runFrames(n: number, dt?: number): unknown;
    summary(): Record<string, unknown>;
  }
}
