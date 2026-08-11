function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (t >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

import { drawScene3D } from "./Scene3D.js";

const DRAW_PLAN = ["sky", "clouds", "fog", "stars", "ocean", "sun", "pier", "beach", "buildings", "foliage", "props", "lamps", "hero", "vignette", "hud"];

export function drawPlan() {
  return [...DRAW_PLAN];
}

export function compositeFrame(ctx, { envRecord, scene, cam, light, options = {} }) {
  const { width = 1280, height = 720 } = options;
  // Canvas must not be resized (C2) - assume correct size
  ctx.clearRect(0, 0, width, height);

  // Sky (upscaled from coarse grid)
  _drawSky(ctx, envRecord, width, height);

  // Stars (only while dawn < 0.35)
  if (envRecord.sky.dawnFactor < 0.35) _drawStars(ctx, envRecord, width, height);

  // Ocean bands
  _drawOcean(ctx, envRecord, width, height, cam);

  // Sun glow sprite
  _drawSun(ctx, envRecord, width, height, cam);

  // 3D scene: pier, beach, buildings, lamps, hero
  if (scene && cam && light) {
    drawScene3D(ctx, scene, cam, light, {
      width, height,
      vignetteStrength: options.vignetteStrength,
      ambient: 0.22 + 0.10 * envRecord.sky.dawnFactor,
      diffuse: 0.75,
      specular: 0.18,
      shininess: 24,
    });
  }

  // Vignette
  _drawVignette(ctx, width, height, options.vignetteStrength ?? 0.4);

  // HUD
  if (options.showHud !== false) drawHud(ctx, envRecord, options);
}

function _drawSky(ctx, envRecord, W, H) {
  if (!ctx.createLinearGradient) return;
  const dawn = envRecord.sky.dawnFactor;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  const top = [0.05 + 0.02 * dawn, 0.05 + 0.1 * dawn, 0.15 + 0.2 * dawn];
  const horizon = [0.5 + 0.3 * dawn, 0.3 + 0.4 * dawn, 0.15 + 0.2 * dawn];
  grad.addColorStop(0, `rgb(${top.map(c => Math.round(c * 255)).join(",")})`);
  grad.addColorStop(1, `rgb(${horizon.map(c => Math.round(c * 255)).join(",")})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function _drawStars(ctx, envRecord, W, H) {
  if (!ctx.beginPath || !ctx.arc || !ctx.fill) return;
  const rand = mulberry32(0x5EED4D00 ^ 0xA5A5A5A5);
  for (let i = 0; i < 90; i++) {
    const x = rand() * W;
    const y = rand() * H * 0.6;
    const sz = 1 + rand() * 1.5;
    const a = 0.3 + rand() * 0.7;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, sz, 0, Math.PI * 2);
    ctx.fill();
  }
}

function _drawOcean(ctx, envRecord, W, H, cam) {
  if (!ctx.fillRect) return;
  const dawn = envRecord.sky.dawnFactor;
  const baseColor = [0.05 + 0.1 * dawn, 0.1 + 0.15 * dawn, 0.2 + 0.2 * dawn];
  ctx.fillStyle = `rgb(${baseColor.map(c => Math.round(c * 255)).join(",")})`;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);
}

function _drawSun(ctx, envRecord, W, H, cam) {
  if (!ctx.createRadialGradient || !ctx.beginPath || !ctx.arc || !ctx.fill) return;
  const sunProj = cam.project(envRecord.sun.sunWorld);
  if (!sunProj) return;
  const dawn = envRecord.sky.dawnFactor;
  const grad = ctx.createRadialGradient(sunProj.X, sunProj.Y, 0, sunProj.X, sunProj.Y, 80 * (0.5 + dawn));
  grad.addColorStop(0, `rgba(255, ${Math.round(200 + 55 * dawn)}, ${Math.round(100 * (1 - dawn))}, ${0.8 - 0.3 * dawn})`);
  grad.addColorStop(1, "rgba(255,200,50,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(sunProj.X, sunProj.Y, 80 * (0.5 + dawn), 0, Math.PI * 2);
  ctx.fill();
}

function _drawVignette(ctx, W, H, strength) {
  if (!ctx.createRadialGradient || !ctx.fillRect) return;
  const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

export function drawHud(ctx, envRecord, meta = {}) {
  if (!ctx.save || !ctx.font || !ctx.fillStyle || !ctx.fillText || !ctx.restore) return;
  ctx.save();
  ctx.font = "11px Consolas, 'Courier New', monospace";
  ctx.fillStyle = "rgba(200,220,255,0.9)";
  const lines = [
    `frame: ${envRecord.frame} / 300  t: ${envRecord.timeSeconds.toFixed(3)}s`,
    `sunDir: (${envRecord.sun?.sunDir?.x?.toFixed(3) ?? 0}, ${envRecord.sun?.sunDir?.y?.toFixed(3) ?? 0}, ${envRecord.sun?.sunDir?.z?.toFixed(3) ?? 0})  dawn: ${envRecord.sun?.dawnFactor?.toFixed(3) ?? 0}`,
    `replayToken: ${envRecord.replayToken?.slice(0, 16)}...`,
    `projFinite: ${envRecord.sun?.errorBound?.finite}  rt: ${envRecord.sun?.errorBound?.roundtripResidual?.toExponential(1) ?? "N/A"}`,
    `worldId: ${envRecord.worldId}  timelineId: ${envRecord.timelineId}`,
    `intentId: ${envRecord.intentId}`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, 12, 20 + i * 16));
  ctx.restore();
}