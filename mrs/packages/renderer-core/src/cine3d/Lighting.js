export function sunLight({ dawn, sunWorld, camEye }) {
  const dir = {
    x: -sunWorld.x,
    y: -sunWorld.y,
    z: -sunWorld.z,
  };
  const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
  dir.x /= dl; dir.y /= dl; dir.z /= dl;

  const color = [
    Math.round(127 + (255 - 127) * dawn),
    Math.round(168 + (179 - 168) * dawn),
    Math.round(217 + (107 - 217) * dawn),
  ];
  const intensity = 0.8 + 0.4 * dawn;
  return { dir, color, intensity };
}

export function ambientByDawn(dawn) {
  return 0.22 + 0.10 * dawn;
}