export class Rotation4DChoreo {
  static swirl(amplitude = 1.0) {
    return (t) => [
      Math.sin(t * 2.0) * amplitude,
      Math.cos(t * 1.5) * amplitude,
      Math.sin(t * 0.7) * amplitude,
      Math.cos(t * 3.0) * amplitude,
    ];
  }

  static pulse(speed = 4.0) {
    return (t) => {
      const v = Math.sin(t * speed);
      return [v, v * 0.5, v * 0.25, v * 0.75];
    };
  }

  static orbit(radius = 1.0) {
    return (t) => [
      Math.cos(t) * radius,
      Math.sin(t) * radius,
      Math.cos(t * 0.5) * radius,
      Math.sin(t * 0.5) * radius,
    ];
  }

  static spiral(rate = 1.0) {
    return (t) => [
      Math.sin(t * rate) * (1 + 0.3 * Math.sin(t * 0.5)),
      Math.cos(t * rate * 0.8) * (1 + 0.3 * Math.cos(t * 0.3)),
      Math.sin(t * rate * 1.2) * (1 + 0.3 * Math.sin(t * 0.7)),
      Math.cos(t * rate * 0.6) * (1 + 0.3 * Math.cos(t * 0.4)),
    ];
  }

  static bounce() {
    return (t) => {
      const phase = t * 3.0;
      return [Math.abs(Math.sin(phase)), Math.abs(Math.cos(phase * 0.7)), Math.abs(Math.sin(phase * 1.3)), Math.abs(Math.cos(phase * 0.5))];
    };
  }
}
