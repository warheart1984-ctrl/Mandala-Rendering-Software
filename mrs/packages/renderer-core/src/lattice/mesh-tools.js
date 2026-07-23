export const latticePresets = Object.freeze({
  hypersphere: { quantile: 0.72, minComponentFaces: 8 },
  torus: { quantile: 0.68, minComponentFaces: 8 },
  gyroid: { quantile: 0.55, minComponentFaces: 12 },
  "sphere-grid": { quantile: 0.7, minComponentFaces: 6 },
  noise: { quantile: 0.7, minComponentFaces: 18 },
  ridged: { quantile: 0.64, minComponentFaces: 18 },
  "warped-gyroid": { quantile: 0.58, minComponentFaces: 12 },
});

export function densityQuantile(lattice, q = 0.65) {
  let values = Array.from(lattice.density ?? []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return 0;
  const range = values.at(-1) - values[0];
  const active = values.filter((v) => v > values[0] + range * 1e-6);
  if (active.length >= Math.max(8, values.length * 0.001)) values = active;
  return values[Math.max(0, Math.min(values.length - 1, Math.round((values.length - 1) * q)))];
}

export function meshBounds4D(mesh) {
  const axes = ["x", "y", "z", "w"];
  const min = { x: Infinity, y: Infinity, z: Infinity, w: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity, w: -Infinity };
  for (const v of mesh.vertices) for (const a of axes) { min[a] = Math.min(min[a], v[a]); max[a] = Math.max(max[a], v[a]); }
  return { min, max };
}

export function normalizeMesh4D(mesh, targetRadius = 1.5) {
  if (!mesh.vertices.length) return mesh;
  const { min, max } = meshBounds4D(mesh);
  const center = {}; let extent = 0;
  for (const a of ["x", "y", "z", "w"]) { center[a] = (min[a] + max[a]) / 2; extent = Math.max(extent, (max[a] - min[a]) / 2); }
  const factor = extent > 1e-9 ? targetRadius / extent : 1;
  return { ...mesh, vertices: mesh.vertices.map((v) => ({ x:(v.x-center.x)*factor, y:(v.y-center.y)*factor, z:(v.z-center.z)*factor, w:(v.w-center.w)*factor })), normalization: { center, factor } };
}

export function latticeDiagnostics(lattice, isolevel) {
  const values = Array.from(lattice.density ?? []).filter(Number.isFinite);
  const above = values.filter((v) => v > isolevel).length;
  return { samples: values.length, isolevel, occupancy: values.length ? above / values.length : 0 };
}

export function filterMeshComponents(mesh, minFaces = 1) {
  if (minFaces <= 1 || !mesh.faces.length) return mesh;
  const vertexFaces = new Map();
  mesh.faces.forEach((face, fi) => face.forEach((v) => { const list = vertexFaces.get(v) ?? []; list.push(fi); vertexFaces.set(v, list); }));
  const seen = new Set(), keepFaces = new Set();
  for (let start = 0; start < mesh.faces.length; start++) {
    if (seen.has(start)) continue;
    const queue = [start], component = []; seen.add(start);
    while (queue.length) {
      const fi = queue.pop(); component.push(fi);
      for (const v of mesh.faces[fi]) for (const next of vertexFaces.get(v) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    if (component.length >= minFaces) component.forEach((fi) => keepFaces.add(fi));
  }
  if (!keepFaces.size) return mesh;
  const used = new Set([...keepFaces].flatMap((fi) => mesh.faces[fi]));
  const remap = new Map(); const vertices = [];
  [...used].sort((a,b)=>a-b).forEach((old) => { remap.set(old, vertices.length); vertices.push(mesh.vertices[old]); });
  const faces = [...keepFaces].map((fi) => mesh.faces[fi].map((v) => remap.get(v)));
  const edges = mesh.edges.filter(([a,b]) => used.has(a) && used.has(b)).map(([a,b]) => [remap.get(a), remap.get(b)]);
  return { ...mesh, vertices, faces, edges, componentsFiltered: mesh.faces.length - faces.length };
}

export function weldMesh(mesh, tolerance = 1e-5) {
  const vertices = [], remap = new Map(), buckets = new Map();
  const q = (n) => Math.round(n / tolerance);
  mesh.vertices.forEach((v, old) => {
    const key = `${q(v.x)},${q(v.y)},${q(v.z)},${q(v.w)}`;
    let index = buckets.get(key);
    if (index === undefined) { index = vertices.length; buckets.set(key, index); vertices.push(v); }
    remap.set(old, index);
  });
  const faces = mesh.faces.map((f) => f.map((i) => remap.get(i))).filter(([a,b,c]) => a !== b && b !== c && a !== c);
  const edgeKeys = new Set();
  for (const [a0,b0] of mesh.edges) { const a=remap.get(a0), b=remap.get(b0); if (a===b) continue; edgeKeys.add(a<b?`${a},${b}`:`${b},${a}`); }
  const edges = [...edgeKeys].map((s) => s.split(",").map(Number));
  return { ...mesh, vertices, faces, edges, weldedVertices: mesh.vertices.length - vertices.length };
}
