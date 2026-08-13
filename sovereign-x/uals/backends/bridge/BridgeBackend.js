/**
 * UALS v1.0 — Bridge Backend Adapter
 * Implements AssistBackendInterface using the hardened JSON-RPC bridge.
 * Allows UALS orchestrator to delegate compute via persistent bridge process.
 */

import { AssistBackendInterface } from "../../abi/AssistBackendInterface.js";
import { UALSError, ERROR_CODES } from "../../types.js";

export class BridgeBackend extends AssistBackendInterface {
  constructor(config = {}) {
    super({
      backendId: config.backendId || "bridge-backend",
      backendType: config.backendType || "bridge",
      determinismLevel: config.determinismLevel || "bit-exact",
      maxTileSize: config.maxTileSize || { width: 2048, height: 2048 },
      supportedKernels: new Set(config.supportedKernels || []),
    });

    this.bridgeClient = config.bridgeClient;
    this.bridgeUrl = config.bridgeUrl || null; // For future HTTP bridge
    this.sessionId = config.sessionId || `uals-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.initialized = false;
  }

  /**
   * Create a BridgeBackend using the Python JSON-RPC client.
   * @param {object} config - { sx_path, python_bridge_client }
   * @returns {Promise<BridgeBackend>}
   */
  static async createWithPythonBridge(config = {}) {
    const { createBridgeClient } = await import("./BridgeBackendClient.js");
    const client = await createBridgeClient(config);
    return new BridgeBackend({
      ...config,
      bridgeClient: client,
    });
  }

  async _doInit(context) {
    if (!this.bridgeClient) {
      throw new UALSError(
        ERROR_CODES.BACKEND_INIT_FAILED,
        "BridgeBackend requires bridgeClient or bridgeUrl"
      );
    }

    // Send uals.init via bridge
    const result = await this._bridgeCall("uals.init", {
      sessionId: this.sessionId,
      backendId: this.backendId,
      backendType: this.backendType,
      maxTileSize: this.maxTileSize,
      supportedKernels: Array.from(this.supportedKernels),
      determinismLevel: this.determinismLevel,
      context,
    });

    if (!result.ok) {
      throw new UALSError(
        ERROR_CODES.BACKEND_INIT_FAILED,
        `Bridge init failed: ${result.message}`
      );
    }

    this.initialized = true;
    this.context = { ...context, ...result.context };

    return {
      success: true,
      backendId: this.backendId,
      backendType: this.backendType,
      maxTileSize: this.maxTileSize,
      supportedKernels: Array.from(this.supportedKernels),
      determinismLevel: this.determinismLevel,
      sessionId: this.sessionId,
      provenance: result.provenance,
    };
  }

  async _doExecute(kernelId, params, tile) {
    if (!this.initialized) {
      throw new UALSError(
        ERROR_CODES.BACKEND_EXECUTE_FAILED,
        `BridgeBackend ${this.backendId} not initialized`
      );
    }

    if (!this.supportedKernels.has(kernelId)) {
      throw new UALSError(
        ERROR_CODES.KERNEL_INCOMPATIBLE,
        `Kernel ${kernelId} not supported by backend ${this.backendId}. Supported: ${Array.from(this.supportedKernels).join(", ")}`
      );
    }

    const result = await this._bridgeCall("uals.execute", {
      sessionId: this.sessionId,
      kernelId,
      params,
      tile: {
        tileId: tile.tileId,
        x: tile.x,
        y: tile.y,
        width: tile.width,
        height: tile.height,
        metadata: tile.metadata || {},
      },
    });

    if (!result.ok) {
      throw new UALSError(
        ERROR_CODES.BACKEND_EXECUTE_FAILED,
        `Bridge execute failed: ${result.message}`
      );
    }

    // Parse output from bridge response
    const output = result.output ? this._deserializeOutput(result.output) : null;

    return {
      output,
      metadata: {
        ...result.metadata,
        executionTimeMs: result.elapsedMs,
        determinismLevel: this.determinismLevel,
        provenance: result.provenance,
      },
    };
  }

  async _doReadback(tile) {
    if (!this.initialized) {
      throw new UALSError(
        ERROR_CODES.BACKEND_READBACK_FAILED,
        `BridgeBackend ${this.backendId} not initialized`
      );
    }

    // Readback is handled in execute for this bridge backend
    // But we provide a separate call for completeness
    const result = await this._bridgeCall("uals.readback", {
      sessionId: this.sessionId,
      tileId: tile.tileId,
    });

    if (!result.ok) {
      throw new UALSError(
        ERROR_CODES.BACKEND_READBACK_FAILED,
        `Bridge readback failed: ${result.message}`
      );
    }

    return { success: true, output: result.output ? this._deserializeOutput(result.output) : null };
  }

  async _doTeardown() {
    if (!this.initialized) {
      return { message: "BridgeBackend not initialized" };
    }

    const result = await this._bridgeCall("uals.teardown", {
      sessionId: this.sessionId,
    });

    this.initialized = false;
    this.context = null;

    return { success: true, message: result.message || "Bridge backend teardown complete" };
  }

  async _bridgeCall(method, params) {
    if (!this.bridgeClient) {
      throw new UALSError(
        ERROR_CODES.INTERNAL_ERROR,
        "No bridge client available"
      );
    }

    // Support both our custom client and generic call interface
    if (typeof this.bridgeClient.call === "function") {
      return this.bridgeClient.call(method, params);
    }
    if (typeof this.bridgeClient[method] === "function") {
      return this.bridgeClient[method](params);
    }
    throw new UALSError(
      ERROR_CODES.INTERNAL_ERROR,
      `Bridge client does not support method ${method}`
    );
  }

  _deserializeOutput(output) {
    if (!output) return null;
    // Handle base64 PNG or raw RGBA data from bridge
    if (output.pngBase64) {
      // Return object that can be parsed by PNG parser
      return { pngBase64: output.pngBase64 };
    }
    if (output.data) {
      return output;
    }
    return output;
  }

  getCapabilities() {
    const caps = super.getCapabilities();
    caps.sessionId = this.sessionId;
    caps.bridgeConnected = !!this.bridgeClient;
    return caps;
  }
}

export function createBridgeBackend(config) {
  return new BridgeBackend(config);
}