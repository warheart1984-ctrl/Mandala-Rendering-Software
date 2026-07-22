import { MeshStreamer } from "./MeshStreamer.js";
import { UnityClientProtocol } from "./UnityClientProtocol.js";

export class LiveLinkServer {
  constructor(options = {}) {
    this.port = options.port ?? 9487;
    this.host = options.host ?? "127.0.0.1";
    this._ws = null;
    this._server = null;
    this.clients = new Set();
    this.protocols = new Map();
    this.streamer = new MeshStreamer();
    this.onClientConnect = options.onClientConnect ?? null;
    this.onClientDisconnect = options.onClientDisconnect ?? null;
    this.onCommand = options.onCommand ?? null;
    this._running = false;
  }

  async start() {
    if (this._running) return;
    const { WebSocketServer } = await import("ws");

    this._server = new WebSocketServer({ port: this.port, host: this.host });
    this._running = true;

    this._server.on("connection", (ws, req) => {
      const clientInfo = {
        id: `client_${Date.now()}`,
        remoteAddress: req.socket.remoteAddress,
        connectedAt: Date.now(),
        protocol: "unity",
      };
      this.clients.add(clientInfo);
      const handler = new UnityClientProtocol(ws, clientInfo);
      this.protocols.set(clientInfo.id, handler);

      handler.onCommand = (cmd) => {
        if (this.onCommand) this.onCommand(clientInfo, cmd);
      };

      if (this.onClientConnect) this.onClientConnect(clientInfo);

      ws.on("close", () => {
        this.clients.delete(clientInfo);
        this.protocols.delete(clientInfo.id);
        if (this.onClientDisconnect) this.onClientDisconnect(clientInfo);
      });

      ws.on("error", () => {
        this.clients.delete(clientInfo);
        this.protocols.delete(clientInfo.id);
      });
    });

    return this;
  }

  broadcastMesh(mesh, transform, options = {}) {
    const data = this.streamer.serialize(mesh, transform, options);
    for (const [id, handler] of this.protocols) {
      try {
        handler.sendMeshUpdate(data);
      } catch {}
    }
  }

  broadcastJSON(payload) {
    const json = JSON.stringify(payload);
    for (const [id, handler] of this.protocols) {
      try {
        handler.sendRaw(json);
      } catch {}
    }
  }

  broadcastConfig(config) {
    for (const [id, handler] of this.protocols) {
      try {
        handler.sendConfig(config);
      } catch {}
    }
  }

  /**
   * Broadcast 4D entity state for Unity Π₃D.
   * snapshot: { frame, seed?, entities: [{ id, pos4:[x,y,z,w], ... }] }
   */
  broadcastStateSnapshot(snapshot) {
    for (const handler of this.protocols.values()) {
      try {
        handler.sendStateSnapshot(snapshot);
      } catch {}
    }
  }

  getClientCount() {
    return this.clients.size;
  }

  stop() {
    if (!this._running) return;
    for (const handler of this.protocols.values()) handler.close();
    this.protocols.clear();
    this.clients.clear();
    if (this._server) {
      this._server.close();
      this._server = null;
    }
    this._running = false;
  }
}
