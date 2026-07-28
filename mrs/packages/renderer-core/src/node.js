/**
 * Node-oriented entry for @mrs/renderer-core.
 *
 * Prefer this when importing APIs that use node:fs / child_process / canvas
 * (e.g. GPUPreviewClient, LiveLinkServer, CLI helpers). The package root
 * (`.`) remains a mixed surface for historical imports — not a guarantee of
 * browser-only modules.
 */

export {
  GPUPreviewClient,
  PreviewState,
  createGPUPreviewClient,
} from "./gpu/GPUPreviewClient.js";

export {
  SharedConfigBlock,
  SharedImageFormat,
  SharedResourceType,
  SharedGPUError,
  makeImageHandleName,
  makeSemaphoreHandleName,
  makeConfigHandleName,
  FLAG,
  ProducerStatus,
  ConsumerStatus,
  SHARED_GPU_IMAGE_MAGIC,
  SHARED_GPU_IMAGE_VERSION,
  gpuErrorToString,
} from "./gpu/SharedGPUImage.js";

export { LiveLinkServer } from "./live-link/LiveLinkServer.js";
export { MeshStreamer } from "./live-link/MeshStreamer.js";
export { UnityClientProtocol } from "./live-link/UnityClientProtocol.js";
