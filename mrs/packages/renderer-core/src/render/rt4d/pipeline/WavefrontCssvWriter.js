/**
 * Optional CSSV wavefront evidence writer.
 * Node: append JSONL to a file when `filePath` is set.
 * Browser / missing fs: keep in-memory records only (no throw).
 */

/**
 * @param {object} [options]
 * @param {string} [options.filePath] — JSONL path (Node only)
 * @returns {{ write: (rec: object) => Promise<void>, records: object[], flush: () => Promise<void> }}
 */
export function createWavefrontCssvWriter(options = {}) {
  /** @type {object[]} */
  const records = [];
  const filePath = options.filePath ?? null;
  let appendFn = null;

  if (filePath) {
    try {
      // Dynamic import keeps browser bundles from resolving node:fs at parse time
      appendFn = async (line) => {
        const fs = await import("node:fs/promises");
        await fs.appendFile(filePath, line, "utf8");
      };
    } catch {
      appendFn = null;
    }
  }

  return {
    records,
    /**
     * @param {object} rec
     */
    async write(rec) {
      records.push(rec);
      if (!appendFn) return;
      try {
        await appendFn(`${JSON.stringify(rec)}\n`);
      } catch {
        /* non-enforcing */
      }
    },
    async flush() {
      /* JSONL append is already durable per write */
    },
  };
}
