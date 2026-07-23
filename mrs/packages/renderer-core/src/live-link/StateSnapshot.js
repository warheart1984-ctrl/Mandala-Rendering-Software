/**
 * MRS → Unity / clients: 4D state snapshot (dimensional sync).
 * Protocol version 1 — JSON over WebSocket.
 */
export function createStateSnapshot(frame, entities, options = {}) {
  return {
    type: "state_snapshot",
    version: 1,
    frame: frame ?? 0,
    timestamp: options.timestamp ?? Date.now(),
    projection: options.projection ?? "drop_w",
    entities: (entities ?? []).map((e) => ({
      id: e.id,
      pos4: Array.isArray(e.pos4)
        ? e.pos4
        : [e.pos4?.x ?? 0, e.pos4?.y ?? 0, e.pos4?.z ?? 0, e.pos4?.w ?? 0],
      topologyId: e.topologyId ?? null,
      materialId: e.materialId ?? null,
      shaderGraphId: e.shaderGraphId ?? null,
      data: e.data ?? {},
    })),
  };
}

export function project4Dto3D(pos4, mode = "drop_w") {
  const x = Array.isArray(pos4) ? pos4[0] : pos4.x;
  const y = Array.isArray(pos4) ? pos4[1] : pos4.y;
  const z = Array.isArray(pos4) ? pos4[2] : pos4.z;
  const w = Array.isArray(pos4) ? pos4[3] : pos4.w;
  switch (mode) {
    case "drop_w":
      return { x, y, z };
    case "scale_by_w": {
      const s = 1 / (1 + Math.abs(w));
      return { x: x * s, y: y * s, z: z * s };
    }
    default:
      return { x, y, z };
  }
}
