export class TemporalAA {
  constructor(options = {}) {
    this.sampleCount = options.sampleCount ?? 8;
    this.historyWeight = options.historyWeight ?? 0.9;
    this.jitterScale = options.jitterScale ?? 1.0;
    this.colorClipFactor = options.colorClipFactor ?? 0.8;
    this.motionThreshold = options.motionThreshold ?? 0.01;

    this.history = null;
    this.historyValid = false;
    this.currentSample = 0;
    this.haltonSequence = this.generateHaltonSequence(this.sampleCount);
  }

  generateHaltonSequence(count) {
    const seq = [];
    for (let i = 0; i < count; i++) {
      seq.push({
        x: this.halton(i + 1, 2),
        y: this.halton(i + 1, 3),
      });
    }
    return seq;
  }

  halton(index, base) {
    let result = 0;
    let f = 1 / base;
    let i = index;
    while (i > 0) {
      result += f * (i % base);
      i = Math.floor(i / base);
      f /= base;
    }
    return result;
  }

  getJitter(frameIndex, width, height) {
    const s = this.haltonSequence[frameIndex % this.sampleCount];
    return {
      x: ((s.x - 0.5) * 2) * this.jitterScale / width,
      y: ((s.y - 0.5) * 2) * this.jitterScale / height,
    };
  }

  accumulate(currentFrame, frameIndex, velocityMap = null) {
    const w = currentFrame.width;
    const h = currentFrame.height;

    if (!this.history || this.history.width !== w || this.history.height !== h) {
      this.history = this.createAccumulationBuffer(w, h);
      this.historyValid = false;
    }

    const srcData = currentFrame.data;
    const dstData = this.history.data;
    const factor = this.historyValid ? this.historyWeight : 0;

    for (let i = 0; i < srcData.length; i += 4) {
      const r = srcData[i], g = srcData[i + 1], b = srcData[i + 2];
      const prevR = dstData[i], prevG = dstData[i + 1], prevB = dstData[i + 2];

      let blendR, blendG, blendB;

      if (this.historyValid && velocityMap) {
        const px = (i / 4) % w;
        const py = Math.floor((i / 4) / w);
        const vx = velocityMap[py * w * 2 + px * 2];
        const vy = velocityMap[py * w * 2 + px * 2 + 1];
        const reprojX = Math.round(px + vx);
        const reprojY = Math.round(py + vy);
        if (reprojX >= 0 && reprojX < w && reprojY >= 0 && reprojY < h) {
          const reprojIdx = (reprojY * w + reprojX) * 4;
          const clipR = dstData[reprojIdx], clipG = dstData[reprojIdx + 1], clipB = dstData[reprojIdx + 2];
          const minR = Math.max(0, clipR - this.colorClipFactor * 255);
          const maxR = Math.min(255, clipR + this.colorClipFactor * 255);
          const minG = Math.max(0, clipG - this.colorClipFactor * 255);
          const maxG = Math.min(255, clipG + this.colorClipFactor * 255);
          const minB = Math.max(0, clipB - this.colorClipFactor * 255);
          const maxB = Math.min(255, clipB + this.colorClipFactor * 255);
          const clampedPrevR = Math.max(minR, Math.min(maxR, prevR));
          const clampedPrevG = Math.max(minG, Math.min(maxG, prevG));
          const clampedPrevB = Math.max(minB, Math.min(maxB, prevB));
          blendR = r + factor * (clampedPrevR - r);
          blendG = g + factor * (clampedPrevG - g);
          blendB = b + factor * (clampedPrevB - b);
        } else {
          blendR = r; blendG = g; blendB = b;
        }
      } else if (this.historyValid) {
        blendR = r + factor * (prevR - r);
        blendG = g + factor * (prevG - g);
        blendB = b + factor * (prevB - b);
      } else {
        blendR = r; blendG = g; blendB = b;
      }

      dstData[i] = Math.round(blendR);
      dstData[i + 1] = Math.round(blendG);
      dstData[i + 2] = Math.round(blendB);
      dstData[i + 3] = srcData[i + 3];
    }

    this.historyValid = true;
    this.currentSample = (this.currentSample + 1) % this.sampleCount;

    return this.history;
  }

  resolve() {
    if (!this.history) return null;
    const out = this.createAccumulationBuffer(this.history.width, this.history.height);
    const src = this.history.data;
    const dst = out.data;
    for (let i = 0; i < src.length; i += 4) {
      dst[i] = src[i];
      dst[i + 1] = src[i + 1];
      dst[i + 2] = src[i + 2];
      dst[i + 3] = src[i + 3];
    }
    return out;
  }

  reset() {
    this.historyValid = false;
    this.currentSample = 0;
    if (this.history) {
      this.history.data.fill(0);
    }
  }

  createAccumulationBuffer(width, height) {
    return {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    };
  }

  getProgress() {
    return this.historyValid ? (this.currentSample / this.sampleCount) : 0;
  }

  isConverged() {
    return this.currentSample >= this.sampleCount - 1;
  }
}

export function createTemporalAA(options = {}) {
  return new TemporalAA(options);
}
