/** @typedef {"vulkan"|"dx12"|"webgpu"} RhiBackend */

/**
 * @typedef {object} RhiDeviceInfo
 * @property {number} id
 * @property {string} name
 * @property {RhiBackend} backend
 * @property {boolean} supportsRayTracing
 * @property {boolean} supportsMultiGpu
 */

/**
 * @typedef {object} RhiBufferHandle
 * @property {number} id
 * @property {number} size
 */

/**
 * @typedef {object} RhiTextureHandle
 * @property {number} id
 * @property {number} width
 * @property {number} height
 * @property {"rgba8"|"rgba16f"|"rgba32f"} format
 */

export const RHI_BACKENDS = Object.freeze(["vulkan", "dx12", "webgpu"]);
