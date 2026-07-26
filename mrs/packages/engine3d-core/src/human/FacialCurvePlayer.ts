import type { FacialCurve, FacialRig } from "./HumanRigTypes.js";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sortedKeyframes(curve: FacialCurve) {
  return curve.keyframes
    .filter((keyframe) => Number.isFinite(keyframe.time))
    .slice()
    .sort((a, b) => a.time - b.time);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function allMorphIds(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): string[] {
  return Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
}

export class FacialCurvePlayer {
  constructor(private readonly facialRig: FacialRig) {}

  evaluate(time: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const curve of this.facialRig.curves) {
      const sampled = this.sampleCurve(curve, time);
      for (const [morphId, weight] of Object.entries(sampled)) {
        out[morphId] = (out[morphId] ?? 0) + weight;
      }
    }
    return Object.fromEntries(
      Object.entries(out)
        .filter(([, value]) => Number.isFinite(value) && value !== 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  sampleCurve(curve: FacialCurve, time: number): Record<string, number> {
    const keyframes = sortedKeyframes(curve);
    if (keyframes.length === 0) return {};
    if (time <= keyframes[0]!.time) return { ...keyframes[0]!.weights };
    const last = keyframes[keyframes.length - 1]!;
    if (time >= last.time) return { ...last.weights };

    for (let i = 0; i + 1 < keyframes.length; i++) {
      const a = keyframes[i]!;
      const b = keyframes[i + 1]!;
      if (time < a.time || time > b.time) continue;
      const span = b.time - a.time;
      const t = span > 0 ? clamp01((time - a.time) / span) : 0;
      const out: Record<string, number> = {};
      for (const morphId of allMorphIds(a.weights, b.weights)) {
        out[morphId] = lerp(a.weights[morphId] ?? 0, b.weights[morphId] ?? 0, t);
      }
      return out;
    }

    return {};
  }
}
