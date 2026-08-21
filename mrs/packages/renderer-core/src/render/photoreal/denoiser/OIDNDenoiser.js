// OIDN Denoiser wrapper - placeholder for native integration
export class OIDNDenoiser {
  constructor(config = {}) {
    this.quality = config.quality || "high";
    this.useGPU = config.useGPU !== false;
    this.cleanAux = config.cleanAux !== false;
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) return;
    try {
      // Dynamic import for OIDN (WebAssembly or native addon)
      // this.oidn = await import('oidn-webassembly') || require('oidn-native');
      this._initialized = true;
    } catch (e) {
      console.warn('[OIDN] Not available, using fallback');
    }
  }

  async denoise(frame) {
    await this.initialize();
    
    if (!this._initialized) {
      // Fallback to temporal denoiser
      const { TemporalDenoiser } = await import('./TemporalDenoiser.js');
      const denoiser = new TemporalDenoiser({ historyLength: 8 });
      return denoiser.denoise(frame);
    }
    
    // Native OIDN path would go here
    // For now, fallback
    const { TemporalDenoiser } = await import('./TemporalDenoiser.js');
    const denoiser = new TemporalDenoiser({ historyLength: 8 });
    return denoiser.denoise(frame);
  }
}

export { TemporalDenoiser } from './TemporalDenoiser.js';