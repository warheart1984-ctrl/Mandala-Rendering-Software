export class AudioKeyframes {
  static fromFFT(fftData, duration, track) {
    const n = fftData.length;
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * duration;
      track.addKeyframe(t, fftData[i], "linear");
    }
    return track;
  }

  static frequencyBand(fftData, bandStart, bandEnd) {
    let sum = 0, count = 0;
    for (let i = bandStart; i <= bandEnd; i++) {
      sum += fftData[i];
      count++;
    }
    return count > 0 ? sum / count : 0;
  }

  static bassAmplitude(fftData) {
    return this.frequencyBand(fftData, 0, 5);
  }

  static midAmplitude(fftData) {
    return this.frequencyBand(fftData, 6, 20);
  }

  static trebleAmplitude(fftData) {
    return this.frequencyBand(fftData, 21, 50);
  }
}
