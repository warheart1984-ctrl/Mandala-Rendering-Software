export interface Clock {
  readonly time: number;
  deltaTime(): number;
}

/**
 * Fixed-step deterministic clock for demos/tests.
 * Does not use Date.now().
 */
export class FixedStepClock implements Clock {
  private _time = 0;

  constructor(private readonly fixedDt: number = 1 / 60) {
    if (!(fixedDt > 0) || !Number.isFinite(fixedDt)) {
      throw new Error(`FixedStepClock dt must be finite > 0 (got ${fixedDt})`);
    }
  }

  get time(): number {
    return this._time;
  }

  deltaTime(): number {
    this._time += this.fixedDt;
    return this.fixedDt;
  }

  reset(): void {
    this._time = 0;
  }
}
