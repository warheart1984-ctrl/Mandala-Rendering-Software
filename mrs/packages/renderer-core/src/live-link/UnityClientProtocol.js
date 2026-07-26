import { handleSceneSpecMessage } from "./sceneSpecHandler.js";
import { SHADING_UPDATE_TYPE, validateShadingUpdateMessage } from "./shadingWire.js";

export class UnityClientProtocol {
  /**
   * @param {import("ws").WebSocket} ws
   * @param {object} clientInfo
   * @param {{
   *   inspector?: { handleWireMessage: (msg: object) => object } | null,
   *   onShadingUpdate?: (msg: object, clientInfo: object) => void,
   * }} [options]
   */
  constructor(ws, clientInfo, options = {}) {
    this.ws = ws;
    this.clientInfo = clientInfo;
    this.onCommand = null;
    /** Optional MRSInspector4D (or handleWireMessage-compatible) for inspect_* protocol. */
    this.inspector = options.inspector ?? null;
    /** Optional host hook when a client publishes shading_update (inspection). */
    this.onShadingUpdate = options.onShadingUpdate ?? null;
    this._setup();
  }

  _setup() {
    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this._handleMessage(msg);
      } catch {}
    });
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case "ping":
        this.sendRaw(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        break;
      case "inspect_screen":
      case "inspect_ray":
      case "inspect_primitive":
      case "scene_push":
      case "scene_bind":
      case "scene_status":
      case "get_scene_status":
      case "scene_reset":
        this._handleInspect(msg);
        break;
      case "get_mesh":
        if (this.onCommand) this.onCommand({ type: "request_mesh", requestId: msg.requestId });
        break;
      case "set_config":
        if (this.onCommand) this.onCommand({ type: "config", config: msg.config });
        break;
      case "set_param":
        if (this.onCommand) this.onCommand({ type: "param", name: msg.name, value: msg.value });
        break;
      case "request_frame":
        if (this.onCommand) this.onCommand({ type: "frame", frame: msg.frame ?? 0, requestId: msg.requestId });
        break;
      case "scene_spec":
        this._send(handleSceneSpecMessage(msg));
        break;
      case SHADING_UPDATE_TYPE: {
        const check = validateShadingUpdateMessage(msg, { requireEntries: true, maxEntries: 4096 });
        if (!check.ok) {
          this._send({
            type: "shading_nack",
            schemaVersion: "1.0",
            ok: false,
            errors: check.errors,
          });
          break;
        }
        if (this.onShadingUpdate) this.onShadingUpdate(msg, this.clientInfo);
        if (this.onCommand) this.onCommand({ type: "shading_update", message: msg });
        break;
      }
      default:
        if (this.onCommand) this.onCommand(msg);
    }
  }

  _handleInspect(msg) {
    if (!this.inspector?.handleWireMessage) {
      const isScene =
        msg.type === "scene_push" ||
        msg.type === "scene_bind" ||
        msg.type === "scene_status" ||
        msg.type === "get_scene_status" ||
        msg.type === "scene_reset";
      this._send(
        isScene
          ? {
              type: "scene_bound",
              schemaVersion: "1.1",
              ok: false,
              error: "no_inspector",
            }
          : {
              type: "inspect_result",
              schemaVersion: "1.1",
              ok: false,
              error: "no_inspector",
            },
      );
      return;
    }
    try {
      const out = this.inspector.handleWireMessage(msg);
      this._send(out);
    } catch (err) {
      const isScene =
        msg.type === "scene_push" ||
        msg.type === "scene_bind" ||
        msg.type === "scene_status" ||
        msg.type === "get_scene_status" ||
        msg.type === "scene_reset";
      this._send(
        isScene
          ? {
              type: "scene_bound",
              schemaVersion: "1.1",
              ok: false,
              error: err?.message ? `bind_error:${err.message}` : "bind_error",
            }
          : {
              type: "inspect_result",
              schemaVersion: "1.1",
              ok: false,
              error: err?.message ? `inspect_error:${err.message}` : "inspect_error",
            },
      );
    }
  }

  sendMeshUpdate(meshData) {
    this._send({ type: "mesh_update", ...meshData });
  }

  sendConfig(config) {
    this._send({ type: "config", config });
  }

  /** MRS → Unity dimensional state (LEL-C skeleton). */
  sendStateSnapshot(snapshot) {
    this._send({
      type: "state_snapshot",
      frame: snapshot.frame ?? 0,
      seed: snapshot.seed ?? 0,
      timestamp: snapshot.timestamp ?? Date.now(),
      entities: snapshot.entities ?? [],
    });
  }

  /**
   * Inspection channel: ShadingInput4D JSON (not Shade4D / PLP Scene3D).
   * @param {object} shadingMessage
   */
  sendShadingUpdate(shadingMessage) {
    this._send(shadingMessage);
  }

  sendRaw(text) {
    try {
      this.ws.send(text);
    } catch {}
  }

  _send(obj) {
    try {
      this.ws.send(JSON.stringify(obj));
    } catch {}
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}
