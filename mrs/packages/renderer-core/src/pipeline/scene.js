/**
 * Scene configuration — binds a surface, camera, and render settings.
 */
import { getRenderProfile } from "../render/profiles.js";

export function createScene(options = {}) {
  const profile = getRenderProfile(options.profile ?? "technical");
  return {
    surface: options.surface ?? "clifford-torus",
    resolution: options.resolution ?? 64,
    width: options.width ?? 1920,
    height: options.height ?? 1080,
    d4: options.d4 ?? 4.0,
    d3: options.d3 ?? 4.0,
    scale: options.scale ?? 80,
    profile: options.profile ?? "technical",
    scaleMode: options.scaleMode ?? profile.scaleMode ?? "fit",
    padding: options.padding ?? profile.padding ?? 0.12,
    temporalFraming: options.temporalFraming ?? true,
    supersample: options.supersample ?? 1,
    renderMode: options.renderMode ?? profile.renderMode ?? "wireframe",
    background: options.background ?? profile.background ?? "#0e1216",
    rotationWeights: options.rotationWeights ?? {
      xw: 0.7,
      yz: 1.1,
      zw: 1.5,
      yw: 2.0,
    },
    // Animation
    frames: options.frames ?? 240,
    fps: options.fps ?? 30,
    durationSec: options.durationSec ?? null, // computed from frames/fps if null
    loop: options.loop ?? true,
    // Output
    outputDir: options.outputDir ?? "output",
    outputPrefix: options.outputPrefix ?? "frame",
    codec: options.codec ?? "libx264",
    streamToFfmpeg: options.streamToFfmpeg ?? false,
  };
}
