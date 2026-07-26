/**
 * Inspection stub for 4D lift payloads from BridgeContract v1.
 *
 * Status: **skeleton** — stores last `lifted4D` for tests/hosts. Does not claim
 * a 4D continuum substrate, RT4D integration, or spacetime evolution.
 */
export class Substrate4DStub {
  constructor() {
    /** @type {{ x: number, y: number, z: number, w: number }[]} */
    this.lastLifted4D = [];
    this.updateCount = 0;
  }

  /**
   * @param {{ x: number, y: number, z: number, w: number }[]} lifted4D
   */
  update(lifted4D = []) {
    this.lastLifted4D = lifted4D.slice();
    this.updateCount += 1;
  }
}
