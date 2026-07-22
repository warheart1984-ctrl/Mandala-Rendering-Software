export class UnityClientProtocol {
  constructor(ws, clientInfo) {
    this.ws = ws;
    this.clientInfo = clientInfo;
    this.onCommand = null;
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
      default:
        if (this.onCommand) this.onCommand(msg);
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
