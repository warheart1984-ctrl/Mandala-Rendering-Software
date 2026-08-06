// mrs/render/rt4d/identity/RenderIdentity.js

export class RenderIdentity {
  constructor({ requestId, actorId, latticeNodeId, timestamp }) {
    this.requestId = requestId;
    this.actorId = actorId;
    this.latticeNodeId = latticeNodeId;
    this.timestamp = timestamp;
  }

  static fromRequest({ requestId, actorId, latticeNodeId, timestamp }) {
    return new RenderIdentity({ requestId, actorId, latticeNodeId, timestamp });
  }

  toJSON() {
    return {
      requestId: this.requestId,
      actorId: this.actorId,
      latticeNodeId: this.latticeNodeId,
      timestamp: this.timestamp,
    };
  }
}