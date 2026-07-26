/**
 * Engine3D — partial living host loop (BridgeContract v1 only).
 *
 * Status: **partial** demo runtime. Substrate/Renderer stubs are **skeleton**.
 * Not Unreal parity. Does not use WaveBridge v2–v6.
 *
 * Locked frame order: gather → evaluate → applyForce → physics.step →
 * substrate.update → renderer.render.
 */

export { World3D } from "./World3D.js";
export { Substrate4DStub } from "./Substrate4DStub.js";
export { Renderer3DStub } from "./Renderer3DStub.js";
export {
  EngineHost,
  LoopClock,
  applyForcesFromBridgeOutputs,
  resolveForcesByBody,
} from "./EngineHost.js";
