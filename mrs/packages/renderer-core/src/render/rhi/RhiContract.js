/**
 * Host-agnostic RHI contract (Drive-G-1: Phase B = WebGPU stub).
 * Wavefront kernels must call only this surface.
 *
 * @typedef {import("./RhiTypes.js").RhiBackend} RhiBackend
 * @typedef {import("./RhiTypes.js").RhiDeviceInfo} RhiDeviceInfo
 * @typedef {import("./RhiTypes.js").RhiBufferHandle} RhiBufferHandle
 * @typedef {import("./RhiTypes.js").RhiTextureHandle} RhiTextureHandle
 *
 * @typedef {object} Rhi
 * @property {() => RhiBackend} getBackend
 * @property {() => Promise<RhiDeviceInfo[]>} getDevices
 * @property {(deviceId?: number) => Promise<RhiDeviceInfo>} selectDevice
 * @property {(size: number, usage: "storage"|"uniform") => Promise<RhiBufferHandle>} createBuffer
 * @property {(width: number, height: number, format: RhiTextureHandle["format"]) => Promise<RhiTextureHandle>} createTexture
 * @property {(handle: RhiBufferHandle, data: ArrayBufferView) => Promise<void>} uploadBuffer
 * @property {(handle: RhiBufferHandle, target: ArrayBufferView) => Promise<void>} readBuffer
 * @property {(
 *   kernelName: string,
 *   workgroupsX: number,
 *   workgroupsY: number,
 *   workgroupsZ: number,
 *   bindings: Record<string, RhiBufferHandle|RhiTextureHandle>
 * ) => Promise<void>} dispatchKernel
 */

export {};
