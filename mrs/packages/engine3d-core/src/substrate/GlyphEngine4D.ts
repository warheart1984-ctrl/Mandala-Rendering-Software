import type { LiftedState4D } from "./LiftedState.js";
import type { Glyph4D } from "./Glyph4D.js";

export interface GlyphEngine4D {
  generateGlyphs(lifted: LiftedState4D): Glyph4D[];
}

export class DefaultGlyphEngine4D implements GlyphEngine4D {
  generateGlyphs(lifted: LiftedState4D): Glyph4D[] {
    const count = Math.floor(lifted.positions4D.length / 4);
    const glyphs: Glyph4D[] = [];
    for (let i = 0; i < count; i++) {
      const pi = i * 4;
      const px = lifted.positions4D[pi] ?? 0;
      const py = lifted.positions4D[pi + 1] ?? 0;
      const pz = lifted.positions4D[pi + 2] ?? 0;
      const pw = lifted.positions4D[pi + 3] ?? 1;
      const vx = lifted.velocities4D[pi] ?? 0;
      const vy = lifted.velocities4D[pi + 1] ?? 0;
      const vz = lifted.velocities4D[pi + 2] ?? 0;
      const vw = lifted.velocities4D[pi + 3] ?? 0;
      const speed = Math.hypot(vx, vy, vz);
      glyphs.push({
        id: `glyph-${i}`,
        position4D: [px, py, pz, pw],
        velocity4D: [vx, vy, vz, vw],
        intensity: 1 / (1 + speed),
        channel: "physics",
      });
    }
    return glyphs;
  }
}
