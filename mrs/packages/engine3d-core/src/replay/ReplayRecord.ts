import type { EngineInputs } from "../bridge/EngineInputs.js";
import type { VisualMod } from "../substrate/VisualMod.js";

export interface ReplayRecord {
  tickIndex: number;
  time: number;
  dt: number;
  inputs: EngineInputs;
  visualMod: VisualMod;
}
