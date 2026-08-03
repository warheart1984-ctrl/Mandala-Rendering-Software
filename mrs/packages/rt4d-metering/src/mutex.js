/**
 * Minimal async mutex for exactly-once durable ledger writes.
 * Status: **partial** (process-local; not a distributed lock).
 */
export class AsyncMutex {
  constructor() {
    /** @type {Promise<void>} */
    this._tail = Promise.resolve();
  }

  /**
   * @template T
   * @param {() => (T | Promise<T>)} fn
   * @returns {Promise<T>}
   */
  runExclusive(fn) {
    const run = this._tail.then(() => fn());
    this._tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
