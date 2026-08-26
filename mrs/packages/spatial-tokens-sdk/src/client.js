/**
 * HoloRT4DClient — skeleton HTTP client for POST /v1/spatial-tokenize.
 * Status: skeleton. Billing response fields are declared (not charged).
 */

/**
 * @typedef {object} ClientOptions
 * @property {string} [baseUrl]
 * @property {typeof fetch} [fetchImpl]
 */

export class HoloRT4DClient {
  /**
   * @param {ClientOptions} [opts]
   */
  constructor(opts = {}) {
    this.baseUrl = String(opts.baseUrl ?? "http://localhost:8792").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  /** @returns {Promise<object>} */
  async status() {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/status`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json();
  }

  /**
   * @param {object} body  TokenizeRequest-shaped JSON
   * @returns {Promise<object>}
   */
  async tokenize(body) {
    const res = await this.fetchImpl(`${this.baseUrl}/v1/spatial-tokenize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`tokenize failed (${res.status}): ${text}`);
    }
    if (!res.ok) {
      throw new Error(data?.detail ?? `tokenize failed (${res.status})`);
    }
    return data;
  }
}
