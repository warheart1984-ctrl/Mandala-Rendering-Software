import type { LiftedState4D } from "./LiftedState.js";
import type { VisualMod } from "./VisualMod.js";
import type { GlyphEngine4D } from "./GlyphEngine4D.js";
import { DefaultGlyphEngine4D } from "./GlyphEngine4D.js";

export interface Substrate4D {
  update(lifted: LiftedState4D): VisualMod;
}

export class DefaultSubstrate4D implements Substrate4D {
  update(lifted: LiftedState4D): VisualMod {
    const count = Math.floor(lifted.positions4D.length / 4);
    const colors = new Float32Array(count * 4);
    const scales = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const ci = i * 4;
      colors[ci] = 1;
      colors[ci + 1] = 1;
      colors[ci + 2] = 1;
      colors[ci + 3] = 1;
      scales[i] = 1;
    }
    return {
      colors,
      scales,
      shaderParams: { substrateIntensity: 1 },
    };
  }
}

export class GlyphSubstrate4D implements Substrate4D {
  constructor(private readonly glyphEngine: GlyphEngine4D = new DefaultGlyphEngine4D()) {}

  update(lifted: LiftedState4D): VisualMod {
    const glyphs = this.glyphEngine.generateGlyphs(lifted);
    const count = glyphs.length;
    const colors = new Float32Array(count * 4);
    const scales = new Float32Array(count);
    let intensitySum = 0;
    for (let i = 0; i < count; i++) {
      const g = glyphs[i]!;
      const ci = i * 4;
      colors[ci] = g.intensity;
      colors[ci + 1] = 0.5;
      colors[ci + 2] = 1 - g.intensity;
      colors[ci + 3] = 1;
      scales[i] = 1 + g.intensity * 0.5;
      intensitySum += g.intensity;
    }
    return {
      colors,
      scales,
      shaderParams: {
        glyphCount: count,
        glyphChannelPhysics: 1,
        glyphIntensity: count > 0 ? intensitySum / count : 0,
      },
    };
  }
}
