/**
 * Wireframe renderer — draws edges with 4D depth coloring.
 */

/**
 * Draw wireframe edges on a 2D canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{X: number, Y: number, z: number, w: number}>} projected - 2D projected points
 * @param {Array<[number, number]>} edges - edge index pairs
 * @param {object} options
 */
export function drawWireframe(ctx, projected, edges, options = {}) {
  const {
    lineWidth = 1.2,
    colorMode = "depth", // "depth" | "solid"
    solidColor = "#c4895a",
    depthColorA = [80, 120, 200],   // near w=-1: cool blue
    depthColorB = [220, 140, 80],   // near w=+1: warm copper
    alphaRange = [0.25, 0.9],
    depthSort = true,
  } = options;

  const drawable = ([i, j]) => {
    const a = projected[i];
    const b = projected[j];
    return a?.visible !== false && b?.visible !== false &&
      Number.isFinite(a?.X) && Number.isFinite(a?.Y) &&
      Number.isFinite(b?.X) && Number.isFinite(b?.Y);
  };

  let sortedEdges = edges.filter(drawable);
  if (depthSort) {
    sortedEdges = sortedEdges
      .map(([i, j]) => ({
        i,
        j,
        depth: (projected[i].z + projected[j].z) / 2,
      }))
      .sort((a, b) => a.depth - b.depth)
      .map((e) => [e.i, e.j]);
  }

  for (const [i, j] of sortedEdges) {
    const a = projected[i];
    const b = projected[j];

    let color;
    let alpha;

    if (colorMode === "depth") {
      const avgW = ((a.w ?? 0) + (b.w ?? 0)) / 2;
      const t = Math.max(0, Math.min(1, (avgW + 1.5) / 3));
      const r = Math.round(depthColorA[0] + (depthColorB[0] - depthColorA[0]) * t);
      const g = Math.round(depthColorA[1] + (depthColorB[1] - depthColorA[1]) * t);
      const bl = Math.round(depthColorA[2] + (depthColorB[2] - depthColorA[2]) * t);
      alpha = alphaRange[0] + (alphaRange[1] - alphaRange[0]) * t;
      color = `rgba(${r},${g},${bl},${alpha})`;
    } else {
      color = solidColor;
      alpha = 0.8;
    }

    const width = lineWidth + (alpha - alphaRange[0]) * 1.5;

    ctx.beginPath();
    ctx.moveTo(a.X, a.Y);
    ctx.lineTo(b.X, b.Y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.stroke();
  }
}

export function drawWireframeSegments(ctx, segments, options = {}) {
  const points = [], edges = [];
  for (const segment of segments) {
    const i = points.length;
    points.push(segment[0], segment[1]);
    edges.push([i, i + 1]);
  }
  drawWireframe(ctx, points, edges, options);
}

/**
 * Draw wireframe vertices as soft dots.
 */
export function drawVertices(ctx, projected, options = {}) {
  const {
    radiusRange = [1.2, 3.0],
    depthColorA = [180, 160, 140],
    depthColorB = [240, 180, 120],
    alphaRange = [0.3, 0.8],
    vertexScale = 1,
  } = options;

  for (const p of projected) {
    if (p?.visible === false || !Number.isFinite(p?.X) || !Number.isFinite(p?.Y)) continue;
    const t = Math.max(0, Math.min(1, ((p.w ?? 0) + 1.5) / 3));
    const r = (radiusRange[0] + (radiusRange[1] - radiusRange[0]) * t) * vertexScale;
    const alpha = alphaRange[0] + (alphaRange[1] - alphaRange[0]) * t;
    const cr = Math.round(depthColorA[0] + (depthColorB[0] - depthColorA[0]) * t);
    const cg = Math.round(depthColorA[1] + (depthColorB[1] - depthColorA[1]) * t);
    const cb = Math.round(depthColorA[2] + (depthColorB[2] - depthColorA[2]) * t);

    ctx.beginPath();
    ctx.arc(p.X, p.Y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
    ctx.fill();
  }
}
