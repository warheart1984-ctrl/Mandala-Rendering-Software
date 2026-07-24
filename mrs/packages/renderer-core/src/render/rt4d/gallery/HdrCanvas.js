/**
 * HDR → display helper — Phase C **partial** (Drive-G-1).
 * Reinhard + gamma. Guards missing DOM.
 */
export class HdrCanvas {
  constructor(domElement = null) {
    this.domElement = domElement ?? null;
    this.ctx = null;
    if (this.domElement && typeof this.domElement.getContext === "function") {
      this.ctx = this.domElement.getContext("2d");
    }
  }

  toneMapPixel(r, g, b, exposure = 1.0, gamma = 2.2) {
    const map = (c) => {
      const v = exposure * c;
      const t = v / (1.0 + v);
      return Math.pow(t, 1.0 / gamma);
    };
    return {
      r: Math.min(255, Math.max(0, Math.floor(map(r) * 255))),
      g: Math.min(255, Math.max(0, Math.floor(map(g) * 255))),
      b: Math.min(255, Math.max(0, Math.floor(map(b) * 255))),
    };
  }

  presentFrame(floatBuffer, width, height, exposure = 1.0) {
    if (!this.ctx || typeof this.ctx.createImageData !== "function") return false;
    const imageData = this.ctx.createImageData(width, height);
    const data = imageData.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        const o = (y * width + x) * 4;
        const tm = this.toneMapPixel(
          floatBuffer[i],
          floatBuffer[i + 1],
          floatBuffer[i + 2],
          exposure
        );
        data[o] = tm.r;
        data[o + 1] = tm.g;
        data[o + 2] = tm.b;
        data[o + 3] = 255;
      }
    }
    this.ctx.putImageData(imageData, 0, 0);
    return true;
  }

  attachToRenderer(_renderer) {
    /* stub */
  }
}
