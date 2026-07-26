import type { Body } from "../world/Body.js";

export interface EngineInputs {
  time: number;
  dt: number;
  bodies: Body[];
  vertices: Float32Array;
}
