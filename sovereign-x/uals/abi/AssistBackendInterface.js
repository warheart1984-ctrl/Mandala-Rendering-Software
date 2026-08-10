/**
 * UALS v1.0 — Assist Backend Interface (ABI)
 * Constitutional contract for all delegated compute backends
 */

import {
  UALSError,
  ERROR_CODES,
  BACKEND_TYPES,
  DETERMINISM_LEVELS,
} from "../types.js";

export class AssistBackendInterface {
  constructor(config = {}) {
    this.backendId = config.backendId || "unknown";
    this.backendType = config.backendType || "custom";
    this.determinismLevel = config.determinismLevel || "bit-exact";
    this.maxTileSize = config.maxTileSize || { width: 512, height: 512 };
    this.supportedKernels = new Set(config.supportedKernels || []);
    this.initialized = false;
    this.context = null;
  }

  validateBackendType() {
    if (!BACKEND_TYPES.includes(this.backendType)) {
      throw new UALSError(
        ERROR_CODES.INVALID_CONFIG,
        `Invalid backend type: ${this.backendType}. Must be one of: ${BACKEND_TYPES.join(", ")}`
      );
    }
  }

  validateDeterminismLevel() {
    if (!DETERMINISM_LEVELS.includes(this.determinismLevel)) {
      throw new UALSError(
        ERROR_CODES.INVALID_CONFIG,
        `Invalid determinism level: ${this.determinismLevel}. Must be one of: ${DETERMINISM_LEVELS.join(", ")}`
      );
    }
  }

  async init(context = {}) {
    this.validateBackendType();
    this.validateDeterminismLevel();

    this.context = {
      ...context,
      backendId: this.backendId,
      backendType: this.backendType,
      initializedAt: Date.now(),
    };

    await this._doInit(this.context);
    this.initialized = true;

    return {
      success: true,
      backendId: this.backendId,
      backendType: this.backendType,
      maxTileSize: this.maxTileSize,
      supportedKernels: Array.from(this.supportedKernels),
      determinismLevel: this.determinismLevel,
    };
  }

  async _doInit(context) {
    throw new UALSError(
      ERROR_CODES.BACKEND_INIT_FAILED,
      "_doInit must be implemented by backend"
    );
  }

  async execute(kernelId, params, tile = {}) {
    if (!this.initialized) {
      throw new UALSError(
        ERROR_CODES.BACKEND_INIT_FAILED,
        `Backend ${this.backendId} not initialized`
      );
    }

    if (!this.supportedKernels.has(kernelId)) {
      throw new UALSError(
        ERROR_CODES.KERNEL_INCOMPATIBLE,
        `Kernel ${kernelId} not supported by backend ${this.backendId}. Supported: ${Array.from(this.supportedKernels).join(", ")}`
      );
    }

    const validatedParams = this._validateParams(kernelId, params);
    const validatedTile = this._validateTile(tile);

    const result = await this._doExecute(kernelId, validatedParams, validatedTile);

    return {
      success: true,
      kernelId,
      backendId: this.backendId,
      tileId: validatedTile.tileId,
      output: result.output,
      metadata: {
        ...result.metadata,
        executionTimeMs: result.executionTimeMs,
        determinismLevel: this.determinismLevel,
      },
    };
  }

  _validateParams(kernelId, params) {
    return params;
  }

  _validateTile(tile) {
    return {
      tileId: tile.tileId || `tile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      x: tile.x || 0,
      y: tile.y || 0,
      width: tile.width || this.maxTileSize.width,
      height: tile.height || this.maxTileSize.height,
      metadata: tile.metadata || {},
    };
  }

  async _doExecute(kernelId, params, tile) {
    throw new UALSError(
      ERROR_CODES.BACKEND_EXECUTE_FAILED,
      "_doExecute must be implemented by backend"
    );
  }

  async readback(tile) {
    if (!this.initialized) {
      throw new UALSError(
        ERROR_CODES.BACKEND_INIT_FAILED,
        `Backend ${this.backendId} not initialized`
      );
    }

    return await this._doReadback(tile);
  }

  async _doReadback(tile) {
    throw new UALSError(
      ERROR_CODES.BACKEND_READBACK_FAILED,
      "_doReadback must be implemented by backend"
    );
  }

  async teardown() {
    if (!this.initialized) {
      return { success: true, message: "Backend not initialized" };
    }

    const result = await this._doTeardown();
    this.initialized = false;
    this.context = null;

    return { success: true, ...result };
  }

  async _doTeardown() {
    return { message: "Teardown complete" };
  }

  getCapabilities() {
    return {
      backendId: this.backendId,
      backendType: this.backendType,
      initialized: this.initialized,
      maxTileSize: this.maxTileSize,
      supportedKernels: Array.from(this.supportedKernels),
      determinismLevel: this.determinismLevel,
    };
  }

  supportsKernel(kernelId) {
    return this.supportedKernels.has(kernelId);
  }
}

export function createBackend(backendClass, config) {
  return new backendClass(config);
}