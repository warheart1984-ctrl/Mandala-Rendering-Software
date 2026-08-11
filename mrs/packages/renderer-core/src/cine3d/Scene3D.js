import { drawSolid } from "../render/solid.js";

let _sceneCache = null;

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildScene3D(seed = 0x5EED4D00) {
  if (_sceneCache) return _sceneCache;

  const rand = mulberry32(seed);
  const foliageRand = mulberry32(seed ^ 0xF0F0F0F0);

  const windowLights = Array.from({ length: 200 }, () => ({
    x: rand() * 80 - 40,
    y: rand() * 20,
    z: rand() * 80 - 40,
    on: rand() > 0.3,
  }));

  const pier = { type: "quad", center: { x: 0, y: 0, z: 2.1 }, xRange: [-3.2, 3.2], zRange: [1.2, 3.0], color: "#3a2f2b" };
  const beach = { type: "quad", center: { x: 0, y: 0, z: 5.5 }, xRange: [-40, 40], zRange: [3.0, 8.0], color: "#4a4238" };
  const buildings = [
    { pos: { x: -15, y: 0, z: 4.5 }, size: { x: 4, y: 9, z: 4 }, color: "#2b3a55" },      // B1
    { pos: { x: -6, y: 0, z: 6.0 }, size: { x: 3, y: 6, z: 3 }, color: "#3a4a66" },       // B2
    { pos: { x: 7, y: 0, z: 5.5 }, size: { x: 3.4, y: 7.5, z: 3.4 }, color: "#333f5c" },  // B3
    { pos: { x: 14, y: 0, z: 4.0 }, size: { x: 4.5, y: 11, z: 4.5 }, color: "#243248" },  // B4
    { pos: { x: -20, y: 0, z: 3.0 }, type: "cylinder", radius: 2.5, height: 12, color: "#2a3a4a" },   // B5 cylinder
    { pos: { x: 20, y: 0, z: 3.5 }, type: "dome", radius: 3.5, height: 8, color: "#3a3a55" },         // B6 dome
    { pos: { x: -30, y: 0, z: 2.0 }, type: "box", size: { x: 12, y: 6, z: 1.5 }, color: "#3a2a2a" }, // B7 wall
    { pos: { x: 25, y: 0, z: 4.0 }, type: "arch", width: 6, height: 8, depth: 2, color: "#4a3a3a" },   // B8 arch
    { pos: { x: -10, y: 0, z: -5.0 }, type: "box", size: { x: 3, y: 15, z: 3 }, color: "#2a2a3a" },   // B9 tower
    { pos: { x: 18, y: 0, z: -8.0 }, type: "pyramid", base: 4, height: 20, color: "#3a2a4a" },         // B10 spire
  ];
  const hero = { pos: { x: 0.35, y: 0, z: 1.7 }, height: 1.75, color: "#10131c" };
  const lamps = [
    { pos: { x: -1.6, y: 0, z: 2.1 }, height: 2.6, glow: "#ffcf9a" },
    { pos: { x: 2.2, y: 0, z: 2.3 }, height: 2.6, glow: "#ffcf9a" },
  ];

  // Foliage: tree clusters (12 clusters)
  const treeClusters = Array.from({ length: 12 }, () => ({
    pos: { x: foliageRand() * 60 - 30, y: 0, z: foliageRand() * 40 - 20 },
    trunkSize: { x: 0.3, y: 2, z: 0.3 },
    canopyRadius: 2.5,
    trunkColor: "#3a2f2b",
    canopyColor: "#2a3a2a",
  }));

  // Grass strips (8 strips)
  const grassStrips = Array.from({ length: 8 }, (_, i) => ({
    pos: { x: -40 + i * 10, y: 0, z: 2 + foliageRand() * 3 },
    size: { x: 2, y: 0.5, z: foliageRand() * 2 + 1 },
    color: "#3a4a2a",
  }));

  // Shrubs (20 shrubs)
  const shrubs = Array.from({ length: 20 }, () => ({
    pos: { x: foliageRand() * 80 - 40, y: 0, z: foliageRand() * 40 - 20 },
    radius: 0.6 + foliageRand() * 0.6,
    color: "#2a3a1a",
  }));

  // Props (30 items)
  const props = Array.from({ length: 30 }, () => {
    const types = ["crate", "barrel", "bench", "lantern", "debris"];
    const type = types[Math.floor(foliageRand() * types.length)];
    return {
      type,
      pos: { x: foliageRand() * 40 - 20, y: 0, z: foliageRand() * 20 - 5 },
      color: ["#4a3a2a", "#3a2a1a", "#2a2a1a", "#ffcf9a", "#2a2a2a"][Math.floor(foliageRand() * 5)],
    };
  });

  _sceneCache = { pier, beach, buildings, hero, lamps, windowLights, treeClusters, grassStrips, shrubs, props, foliageRand };
  return _sceneCache;
}

export function drawScene3D(ctx, scene, cam, light, opts = {}) {
  // Defensive: return early if ctx doesn't have required canvas methods (for test mocks)
  if (!ctx.save || !ctx.restore || !ctx.translate || !ctx.scale || !ctx.beginPath || !ctx.arc || !ctx.fill || !ctx.fillRect) return;
  if (!scene) scene = buildScene3D();

  const { ambient = 0.22, diffuse = 0.75, specular = 0.18, shininess = 24 } = opts;

  // Pier
  drawSolid(ctx, projectQuad(scene.pier, cam), [[0, 1, 2], [0, 2, 3]], quadVertices4d(scene.pier), {
    ambient, diffuse, specular, shininess, lightDirection: light.dir, color: scene.pier.color,
  });

  // Beach
  drawSolid(ctx, projectQuad(scene.beach, cam), [[0, 1, 2], [0, 2, 3]], quadVertices4d(scene.beach), {
    ambient, diffuse, specular, shininess, lightDirection: light.dir, color: scene.beach.color,
  });

  // Buildings
  for (const b of scene.buildings) {
    const { vertices, faces } = boxGeometry(b.pos, b.size);
    const projected = vertices.map(v => cam.project(v));
    drawSolid(ctx, projected, faces, vertices, {
      ambient, diffuse, specular, shininess, lightDirection: light.dir, color: b.color,
    });
  }

  // Lamps (simple vertical cylinders/quads)
  for (const l of scene.lamps) {
    drawSolid(ctx, projectLamp(l, cam), [[0, 1, 2], [0, 2, 3]], lampVertices4d(l), {
      ambient: 0.5, diffuse: 0.3, specular: 0.1, shininess: 10, lightDirection: light.dir, color: l.glow,
    });
  }

  // Hero (silhouette)
  drawHero(ctx, scene.hero, cam, light, opts);
}

function projectQuad(q, cam) {
  const { center, xRange, zRange } = q;
  const [x0, x1] = xRange;
  const [z0, z1] = zRange;
  return [
    cam.project({ x: center.x + x0, y: center.y, z: center.z + z0 }),
    cam.project({ x: center.x + x1, y: center.y, z: center.z + z0 }),
    cam.project({ x: center.x + x1, y: center.y, z: center.z + z1 }),
    cam.project({ x: center.x + x0, y: center.y, z: center.z + z1 }),
  ];
}

function quadVertices4d(q) {
  const { center, xRange, zRange } = q;
  const [x0, x1] = xRange;
  const [z0, z1] = zRange;
  return [
    { x: center.x + x0, y: center.y, z: center.z + z0, w: 1 },
    { x: center.x + x1, y: center.y, z: center.z + z0, w: 1 },
    { x: center.x + x1, y: center.y, z: center.z + z1, w: 1 },
    { x: center.x + x0, y: center.y, z: center.z + z1, w: 1 },
  ];
}

function boxGeometry(pos, size) {
  const { x, y, z } = pos;
  const { x: sx, y: sy, z: sz } = size;
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const vertices = [
    { x: x - hx, y: y - hy, z: z - hz, w: 1 }, { x: x + hx, y: y - hy, z: z - hz, w: 1 },
    { x: x + hx, y: y + hy, z: z - hz, w: 1 }, { x: x - hx, y: y + hy, z: z - hz, w: 1 },
    { x: x - hx, y: y - hy, z: z + hz, w: 1 }, { x: x + hx, y: y - hy, z: z + hz, w: 1 },
    { x: x + hx, y: y + hy, z: z + hz, w: 1 }, { x: x - hx, y: y + hy, z: z + hz, w: 1 },
  ];
  const faces = [
    [0, 1, 2], [0, 2, 3], [4, 7, 6], [4, 6, 5],
    [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2],
    [0, 4, 5], [0, 5, 1], [3, 2, 6], [3, 6, 7],
  ];
  return { vertices, faces };
}

function projectLamp(l, cam) {
  const base = cam.project({ x: l.pos.x, y: l.pos.y, z: l.pos.z });
  const top = cam.project({ x: l.pos.x, y: l.pos.y + l.height, z: l.pos.z });
  if (!base || !top) return [{ X: 0, Y: 0, z: 1 }, { X: 0, Y: 0, z: 1 }, { X: 0.1, Y: 0, z: 1 }, { X: 0.1, Y: 0, z: 1 }];
  return [base, top, { X: top.X + 0.1, Y: top.Y, z: top.z }, { X: base.X + 0.1, Y: base.Y, z: base.z }];
}

function lampVertices4d(l) {
  return [
    { x: l.pos.x, y: l.pos.y, z: l.pos.z, w: 1 },
    { x: l.pos.x, y: l.pos.y + l.height, z: l.pos.z, w: 1 },
    { x: l.pos.x + 0.1, y: l.pos.y + l.height, z: l.pos.z, w: 1 },
    { x: l.pos.x + 0.1, y: l.pos.y, z: l.pos.z, w: 1 },
  ];
}

function drawHero(ctx, hero, cam, light, opts) {
  const proj = cam.project(hero.pos);
  if (!proj) return;
  ctx.save();
  ctx.translate(proj.X, proj.Y);
  const scale = 120 / proj.z;
  ctx.scale(scale, scale);
  ctx.fillStyle = hero.color;
  ctx.beginPath();
  ctx.arc(0, -15, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-6, -7, 12, 20);
  ctx.fillRect(-10, 13, 8, 20);
  ctx.fillRect(2, 13, 8, 20);
  ctx.restore();
}