/**
 * Audio Visualization for 4D Renderer
 * Maps audio analysis data to rotation parameters and other visual effects
 */

export class AudioAnalyzer {
  constructor(options = {}) {
    this.fftSize = options.fftSize ?? 2048;
    this.smoothingTimeConstant = options.smoothingTimeConstant ?? 0.8;
    this.minDecibels = options.minDecibels ?? -90;
    this.maxDecibels = options.maxDecibels ?? -10;
    
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.frequencyData = null;
    this.timeDomainData = null;
    
    this.isPlaying = false;
  }
  
  async init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;
      this.analyser.minDecibels = this.minDecibels;
      this.analyser.maxDecibels = this.maxDecibels;
      
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeDomainData = new Uint8Array(this.analyser.fftSize);
      
      return true;
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      return false;
    }
  }
  
  async loadAudio(url) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      this.source = this.audioContext.createBufferSource();
      this.source.buffer = audioBuffer;
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      
      return audioBuffer;
    } catch (error) {
      console.error('Failed to load audio:', error);
      return null;
    }
  }
  
  async loadMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.source = this.audioContext.createMediaStreamSource(stream);
      this.source.connect(this.analyser);
      // Don't connect to destination to avoid feedback
      return stream;
    } catch (error) {
      console.error('Failed to access microphone:', error);
      return null;
    }
  }
  
  play() {
    if (this.source && this.source.start) {
      this.source.start(0);
      this.isPlaying = true;
    }
  }
  
  pause() {
    if (this.source && this.source.stop) {
      this.source.stop();
      this.isPlaying = false;
    }
  }
  
  stop() {
    if (this.source) {
      if (this.source.stop) this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
    this.isPlaying = false;
  }
  
  update() {
    if (!this.analyser) return null;
    
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.timeDomainData);
    
    return {
      frequency: this.frequencyData,
      timeDomain: this.timeDomainData
    };
  }
  
  getFrequencyData() {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(this.frequencyData);
    return this.frequencyData;
  }
  
  getTimeDomainData() {
    if (!this.analyser) return null;
    this.analyser.getByteTimeDomainData(this.timeDomainData);
    return this.timeDomainData;
  }
  
  /**
   * Get average frequency in a band
   */
  getBandAverage(startFreq, endFreq) {
    if (!this.frequencyData) return 0;
    
    const sampleRate = this.audioContext.sampleRate;
    const binCount = this.frequencyData.length;
    const binSize = sampleRate / this.fftSize;
    
    const startBin = Math.floor(startFreq / binSize);
    const endBin = Math.ceil(endFreq / binSize);
    
    let sum = 0;
    let count = 0;
    
    for (let i = startBin; i < endBin && i < binCount; i++) {
      sum += this.frequencyData[i];
      count++;
    }
    
    return count > 0 ? sum / count : 0;
  }
  
  /**
   * Get bass, mid, and treble levels
   */
  getBands() {
    return {
      bass: this.getBandAverage(20, 250),
      mid: this.getBandAverage(250, 4000),
      treble: this.getBandAverage(4000, 20000)
    };
  }
  
  /**
   * Get overall volume level
   */
  getVolume() {
    if (!this.frequencyData) return 0;
    
    let sum = 0;
    for (let i = 0; i < this.frequencyData.length; i++) {
      sum += this.frequencyData[i];
    }
    
    return sum / this.frequencyData.length;
  }
  
  /**
   * Detect beat based on volume threshold
   */
  detectBeat(threshold = 200) {
    const volume = this.getVolume();
    return volume > threshold;
  }
  
  /**
   * Get spectral centroid (brightness)
   */
  getSpectralCentroid() {
    if (!this.frequencyData) return 0;
    
    let weightedSum = 0;
    let sum = 0;
    
    for (let i = 0; i < this.frequencyData.length; i++) {
      weightedSum += i * this.frequencyData[i];
      sum += this.frequencyData[i];
    }
    
    return sum > 0 ? weightedSum / sum : 0;
  }
}

export class AudioMapper {
  constructor(analyzer, options = {}) {
    this.analyzer = analyzer;
    this.mappings = [];
    this.smoothing = options.smoothing ?? 0.1;
    this.currentValues = {};
    this.targetValues = {};
  }
  
  /**
   * Map audio data to a parameter
   */
  addMapping(target, source, options = {}) {
    this.mappings.push({
      target,
      source,
      min: options.min ?? 0,
      max: options.max ?? 1,
      scale: options.scale ?? 1,
      offset: options.offset ?? 0,
      smoothing: options.smoothing ?? this.smoothing,
      invert: options.invert ?? false,
      clamp: options.clamp ?? true
    });
    
    this.currentValues[target] = 0;
    this.targetValues[target] = 0;
  }
  
  /**
   * Remove mapping
   */
  removeMapping(target) {
    this.mappings = this.mappings.filter(m => m.target !== target);
    delete this.currentValues[target];
    delete this.targetValues[target];
  }
  
  /**
   * Update all mappings
   */
  update() {
    const audioData = this.analyzer.update();
    if (!audioData) return this.currentValues;
    
    for (const mapping of this.mappings) {
      const sourceValue = this.getSourceValue(mapping.source, audioData);
      let mappedValue = this.mapValue(sourceValue, mapping);
      
      // Apply smoothing
      const smoothing = mapping.smoothing;
      this.currentValues[mapping.target] += (mappedValue - this.currentValues[mapping.target]) * smoothing;
    }
    
    return { ...this.currentValues };
  }
  
  getSourceValue(source, audioData) {
    switch (source) {
      case 'volume':
        return this.analyzer.getVolume() / 255;
      case 'bass':
        return this.analyzer.getBands().bass / 255;
      case 'mid':
        return this.analyzer.getBands().mid / 255;
      case 'treble':
        return this.analyzer.getBands().treble / 255;
      case 'centroid':
        return this.analyzer.getSpectralCentroid() / this.analyzer.frequencyData.length;
      case 'beat':
        return this.analyzer.detectBeat() ? 1 : 0;
      default:
        if (source.startsWith('band_')) {
          const freq = parseInt(source.split('_')[1]);
          return this.analyzer.getBandAverage(freq, freq * 2) / 255;
        }
        return 0;
    }
  }
  
  mapValue(value, mapping) {
    let result = value;
    
    // Apply scale and offset
    result = result * mapping.scale + mapping.offset;
    
    // Invert if needed
    if (mapping.invert) {
      result = 1 - result;
    }
    
    // Clamp to range
    if (mapping.clamp) {
      result = Math.max(mapping.min, Math.min(mapping.max, result));
    }
    
    return result;
  }
  
  /**
   * Get current mapped value
   */
  getValue(target) {
    return this.currentValues[target] ?? 0;
  }
  
  /**
   * Get all current values
   */
  getValues() {
    return { ...this.currentValues };
  }
  
  /**
   * Apply mapped values to camera/renderer
   */
  applyTo(camera, renderer) {
    const values = this.getValues();
    
    for (const target in values) {
      const value = values[target];
      
      if (target === 'rotationSpeed') {
        camera.rotationWeights = camera.rotationWeights || {};
        camera.rotationWeights.xw = value;
      } else if (target === 'cameraDistance') {
        camera.d4 = value;
      } else if (target === 'cameraScale') {
        camera.scale = value;
      } else if (target === 'bloomStrength') {
        if (renderer.bloomStrength !== undefined) {
          renderer.bloomStrength = value;
        }
      } else if (target === 'chromaticAberration') {
        if (renderer.chromaticAberrationStrength !== undefined) {
          renderer.chromaticAberrationStrength = value;
        }
      }
    }
  }
}

export class AudioVisualizer {
  constructor(options = {}) {
    this.analyzer = new AudioAnalyzer(options);
    this.mapper = new AudioMapper(this.analyzer, options);
    this.presets = options.presets ?? {};
  }
  
  async init() {
    return await this.analyzer.init();
  }
  
  async loadAudio(url) {
    return await this.analyzer.loadAudio(url);
  }
  
  async loadMicrophone() {
    return await this.analyzer.loadMicrophone();
  }
  
  play() {
    this.analyzer.play();
  }
  
  pause() {
    this.analyzer.pause();
  }
  
  stop() {
    this.analyzer.stop();
  }
  
  update() {
    return this.mapper.update();
  }
  
  addMapping(target, source, options) {
    this.mapper.addMapping(target, source, options);
  }
  
  removeMapping(target) {
    this.mapper.removeMapping(target);
  }
  
  applyTo(camera, renderer) {
    this.mapper.applyTo(camera, renderer);
  }
  
  /**
   * Load a preset mapping configuration
   */
  loadPreset(name) {
    const preset = this.presets[name];
    if (!preset) {
      console.warn(`Preset not found: ${name}`);
      return;
    }
    
    // Clear existing mappings
    this.mapper.mappings = [];
    
    // Apply preset mappings
    for (const mapping of preset.mappings) {
      this.mapper.addMapping(mapping.target, mapping.source, mapping);
    }
  }
  
  /**
   * Default presets
   */
  static getDefaultPresets() {
    return {
      bassReactive: {
        mappings: [
          { target: 'rotationSpeed', source: 'bass', min: 0.3, max: 2.0, scale: 1.5 },
          { target: 'cameraDistance', source: 'bass', min: 3, max: 8, scale: 5, invert: true },
          { target: 'bloomStrength', source: 'volume', min: 0, max: 1, scale: 0.8 }
        ]
      },
      trebleReactive: {
        mappings: [
          { target: 'rotationSpeed', source: 'treble', min: 0.5, max: 3.0, scale: 2.0 },
          { target: 'chromaticAberration', source: 'treble', min: 0, max: 0.02, scale: 0.015 },
          { target: 'cameraScale', source: 'mid', min: 50, max: 120, scale: 70 }
        ]
      },
      fullSpectrum: {
        mappings: [
          { target: 'rotationSpeed', source: 'bass', min: 0.5, max: 2.0, scale: 1.0 },
          { target: 'cameraDistance', source: 'mid', min: 3, max: 7, scale: 4 },
          { target: 'bloomStrength', source: 'treble', min: 0, max: 1, scale: 0.6 },
          { target: 'chromaticAberration', source: 'centroid', min: 0, max: 0.01, scale: 0.008 }
        ]
      },
      beatSync: {
        mappings: [
          { target: 'rotationSpeed', source: 'beat', min: 0.5, max: 3.0, scale: 2.0, smoothing: 0.5 },
          { target: 'cameraDistance', source: 'beat', min: 3, max: 6, scale: 3, smoothing: 0.3 },
          { target: 'bloomStrength', source: 'beat', min: 0.3, max: 1.0, scale: 0.5, smoothing: 0.4 }
        ]
      }
    };
  }
}

export function createAudioAnalyzer(options = {}) {
  return new AudioAnalyzer(options);
}

export function createAudioMapper(analyzer, options = {}) {
  return new AudioMapper(analyzer, options);
}

export function createAudioVisualizer(options = {}) {
  const visualizer = new AudioVisualizer(options);
  visualizer.presets = AudioVisualizer.getDefaultPresets();
  return visualizer;
}
