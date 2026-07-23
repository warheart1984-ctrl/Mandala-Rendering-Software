export const SHARED_GPU_IMAGE_MAGIC = 0x47505553;
export const SHARED_GPU_IMAGE_VERSION = 1;

export const SharedImageFormat = Object.freeze({
  UNDEFINED: 0,
  R8G8B8A8_UNORM: 1,
  R8G8B8A8_SRGB: 2,
  B8G8R8A8_UNORM: 3,
  B8G8R8A8_SRGB: 4,
  R16G16B16A16_SFLOAT: 5,
  R16G16B16A16_UNORM: 6,
  R32G32B32A32_SFLOAT: 7,
});

export const SharedResourceType = Object.freeze({
  INVALID: 0,
  VULKAN_IMAGE: 1,
  VULKAN_SEMAPHORE: 2,
  DXGI_SHARED_RESOURCE: 3,
});

export const FLAG = Object.freeze({
  RESIZE_PENDING: 1 << 0,
  CANCEL_PENDING: 1 << 1,
  DEVICE_LOST: 1 << 2,
  RESTART_REQUESTED: 1 << 3,
  CONSUMER_READY: 1 << 4,
});

export const ProducerStatus = Object.freeze({
  IDLE: 0,
  RENDERING: 1,
  FRAME_READY: 2,
  ERROR: 3,
});

export const ConsumerStatus = Object.freeze({
  DISCONNECTED: 0,
  CONNECTED: 1,
  PRESENTING: 2,
  ERROR: 3,
});

const CONFIG_BLOCK_SIZE = 256;

export function makeImageHandleName(instance, slot) {
  return `Global\\${instance}_image_${slot}`;
}

export function makeSemaphoreHandleName(instance, slot) {
  return `Global\\${instance}_sem_${slot}`;
}

export function makeFenceHandleName(instance) {
  return `Global\\${instance}_fence`;
}

export function makeConfigHandleName(instance) {
  return `Global\\${instance}_config`;
}

export class SharedConfigBlock {
  static write(config, width, height, format, slots, activeSlot, frameCount, flags = 0) {
    const buf = Buffer.alloc(CONFIG_BLOCK_SIZE);
    buf.writeUInt32LE(SHARED_GPU_IMAGE_MAGIC, 0);
    buf.writeUInt32LE(SHARED_GPU_IMAGE_VERSION, 4);
    buf.writeUInt32LE(width, 8);
    buf.writeUInt32LE(height, 12);
    buf.writeUInt32LE(format, 16);
    buf.writeUInt32LE(slots, 20);
    buf.writeUInt32LE(activeSlot, 24);
    buf.writeBigUint64LE(BigInt(frameCount), 28);
    buf.writeBigUint64LE(BigInt(Date.now() * 1e6), 36);
    buf.writeUInt32LE(process.pid, 44);
    buf.writeUInt32LE(config?.consumerPID ?? 0, 48);
    buf.writeUInt32LE(ProducerStatus.FRAME_READY, 52);
    buf.writeUInt32LE(config?.consumerStatus ?? ConsumerStatus.DISCONNECTED, 56);
    buf.writeUInt32LE(flags, 60);
    return buf;
  }

  static read(buffer) {
    const view = new DataView(buffer);
    const magic = view.getUint32(0, true);
    if (magic !== SHARED_GPU_IMAGE_MAGIC) return null;
    return {
      magic,
      version: view.getUint32(4, true),
      width: view.getUint32(8, true),
      height: view.getUint32(12, true),
      format: view.getUint32(16, true),
      doubleBufferSlots: view.getUint32(20, true),
      activeSlot: view.getUint32(24, true),
      frameCount: Number(view.getBigUint64(28, true)),
      lastFrameTimeNs: Number(view.getBigUint64(36, true)),
      producerPID: view.getUint32(44, true),
      consumerPID: view.getUint32(48, true),
      producerStatus: view.getUint32(52, true),
      consumerStatus: view.getUint32(56, true),
      flags: view.getUint32(60, true),
    };
  }

  static getByteSize() {
    return CONFIG_BLOCK_SIZE;
  }
}

export class SharedFrameDescriptor {
  constructor(frameIndex, width, height, format, activeSlot) {
    this.frameIndex = frameIndex;
    this.width = width;
    this.height = height;
    this.format = format;
    this.activeSlot = activeSlot;
  }
}

export class HandleDescriptor {
  constructor(type, handleValue, namedHandle) {
    this.type = type;
    this.handleValue = handleValue;
    this.namedHandle = namedHandle;
  }
}

export const SharedGPUError = Object.freeze({
  SUCCESS: 0,
  HANDLE_NOT_FOUND: 1,
  HANDLE_ACCESS_DENIED: 2,
  DEVICE_LOST: 3,
  TIMEOUT: 4,
  INVALID_PARAMETER: 5,
  OUT_OF_MEMORY: 6,
  FORMAT_UNSUPPORTED: 7,
  PROCESS_NOT_FOUND: 8,
  INTERNAL_ERROR: 9,
});

export function gpuErrorToString(code) {
  const names = Object.entries(SharedGPUError).find(([, v]) => v === code);
  return names ? names[0] : `UNKNOWN(${code})`;
}
