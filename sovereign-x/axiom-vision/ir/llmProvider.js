/**
 * Axiom Vision — LLM Provider Interface.
 *
 * Abstract provider for LLM interpretation. Supports any OpenAI-compatible API:
 *   - OpenAI (gpt-4, gpt-4o)
 *   - Anthropic (via adapter)
 *   - Local Lemonade Server (http://localhost:8305)
 *   - Any /v1/chat/completions endpoint
 *
 * Constitutional constraint: The provider only receives structured evidence,
 * never raw pixels. The LLM interprets evidence, not images.
 */

export class LLMProvider {
  /**
   * @param {Object} config
   * @param {string} config.baseUrl - API base URL (e.g. "http://localhost:13305/api/v1")
   * @param {string} config.model - Model name (e.g. "gpt-4o", "claude-sonnet-4-20250514")
   * @param {string} [config.apiKey] - API key (if required)
   * @param {number} [config.maxTokens=2048] - Max response tokens
   * @param {number} [config.temperature=0.3] - Low temp for grounded reasoning
   * @param {string} [config.responseFormat="json_object"] - Force JSON output
   */
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.model = config.model;
    this.apiKey = config.apiKey || "";
    this.maxTokens = config.maxTokens || 2048;
    this.temperature = config.temperature ?? 0.3;
    this.responseFormat = config.responseFormat || "json_object";
  }

  /**
   * Send a chat completion request.
   *
   * @param {Object[]} messages - [{ role, content }]
   * @returns {Promise<string>} Raw response content
   */
  async chat(messages) {
    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };

    if (this.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }

    const headers = { "Content-Type": "application/json" };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM provider error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  }
}

/**
 * Create a default provider from environment.
 * Priority: OPENAI_BASE_URL > LEMONADE > localhost:13305
 *
 * @param {Object} [overrides]
 * @returns {LLMProvider}
 */
export function createDefaultProvider(overrides = {}) {
  const baseUrl = overrides.baseUrl
    || process.env.OPENAI_BASE_URL
    || process.env.LEMONADE_BASE_URL
    || "http://localhost:13305/api/v1";

  const model = overrides.model
    || process.env.OPENAI_MODEL
    || process.env.LEMONADE_MODEL
    || "gpt-4o";

  const apiKey = overrides.apiKey
    || process.env.OPENAI_API_KEY
    || process.env.LEMONADE_API_KEY
    || "";

  return new LLMProvider({ baseUrl, model, apiKey, ...overrides });
}

/**
 * Create a provider for local Lemonade Server.
 * Uses the local-ai-use convention from AGENTS.md.
 *
 * @param {Object} [overrides]
 * @returns {LLMProvider}
 */
export function createLemonadeProvider(overrides = {}) {
  return new LLMProvider({
    baseUrl: "http://localhost:13305/api/v1",
    model: "gpt-4o",
    apiKey: "",
    ...overrides,
  });
}
