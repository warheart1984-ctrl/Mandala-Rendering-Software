/**
 * Solid face renderer — draws filled triangles with depth shading and backface culling.
 */

/**
 * Draw solid faces on a 2D canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{X: number, Y: number, z: number, w: number}>} projected - 2D projected points
 * @param {Array<[number, number, number]>} faces - triangle index triples
 * @param {Array<{x:number,y:number,z:number,w:number}>} vertices4d - original 4D vertices (for w-depth)
 * @param {object} options
 */
export function drawSolid(ctx, projected, faces, vertices4d, options = {}) {
  const {
    backfaceCull = true,
    depthSort = true,
    depthColorA = [30, 50, 80],    // near: dark blue
    depthColorB = [196, 137, 90],  // far: copper
    alphaRange = [0.4, 0.95],
    strokeEdges = false,
    strokeColor = "rgba(155,176,192,0.15)",
    ambient = 0.35,
    diffuse = 0.75,
    specular = 0.18,
    shininess = 24,
    lightDirection = { x: -0.35, y: -0.55, z: 0.76 },
    fogDensity = 0,
  } = options;

  // Compute face data for sorting and culling
  const faceData = faces.map(([i, j, k]) => {
    const a = projected[i];
    const b = projected[j];
    const c = projected[k];

    if ([a, b, c].some((p) => p?.visible === false || !Number.isFinite(p?.X) || !Number.isFinite(p?.Y))) {
      return null;
    }

    // Average depth for sorting
    const avgZ = (a.z + b.z + c.z) / 3;

    // Average w for coloring
    const avgW =
      ((vertices4d[i]?.w ?? 0) +
        (vertices4d[j]?.w ?? 0) +
        (vertices4d[k]?.w ?? 0)) /
      3;

    // Backface culling via cross product (2D)
    const cross = (b.X - a.X) * (c.Y - a.Y) - (b.Y - a.Y) * (c.X - a.X);

    const va = vertices4d[i], vb = vertices4d[j], vc = vertices4d[k];
    const ux = vb.x - va.x, uy = vb.y - va.y, uz = vb.z - va.z;
    const vx = vc.x - va.x, vy = vc.y - va.y, vz = vc.z - va.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const ll = Math.hypot(lightDirection.x, lightDirection.y, lightDirection.z) || 1;
    const lambert = Math.max(0, -(nx * lightDirection.x + ny * lightDirection.y + nz * lightDirection.z) / ll);

    const highlight = specular * Math.pow(Math.max(0, Math.abs(nz)), shininess);
    return { i, j, k, a, b, c, avgZ, avgW, cross, light: Math.min(1.35, ambient + diffuse * lambert + highlight) };
  }).filter(Boolean);

  // Sort back-to-front
  let sortedFaces = faceData;
  if (depthSort) {
    sortedFaces = [...faceData].sort((a, b) => a.avgZ - b.avgZ);
  }

  for (const face of sortedFaces) {
    // Backface culling (only for closed surfaces)
    if (backfaceCull && face.cross > 0) continue;

    // Compute color from w-depth
    const t = Math.max(0, Math.min(1, (face.avgW + 1.5) / 3));
    const fog = Math.exp(-Math.max(0, Math.abs(face.avgZ)) * fogDensity);
    const shade = face.light * fog;
    const r = Math.round((depthColorA[0] + (depthColorB[0] - depthColorA[0]) * t) * shade);
    const g = Math.round((depthColorA[1] + (depthColorB[1] - depthColorA[1]) * t) * shade);
    const bl = Math.round((depthColorA[2] + (depthColorB[2] - depthColorA[2]) * t) * shade);
    const alpha = (alphaRange[0] + (alphaRange[1] - alphaRange[0]) * t) * Math.max(0.2, fog);

    // Draw filled triangle
    ctx.beginPath();
    ctx.moveTo(face.a.X, face.a.Y);
    ctx.lineTo(face.b.X, face.b.Y);
    ctx.lineTo(face.c.X, face.c.Y);
    ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${bl},${alpha})`;
    ctx.fill();

    // Optional edge stroke
    if (strokeEdges) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }
}
