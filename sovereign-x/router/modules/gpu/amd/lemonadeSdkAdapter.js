/**
 * Lemonade SDK OpenAI-compatible LLM/chat adapter (legacy-efficient assist).
 *
 * Thin façade over lemonadeSdkChatAdapter.js (first-class Live SDK chat client).
 * Kept so SX CLI / legacyEfficientBeauty imports stay stable.
 *
 * STATUS: **partial** — live chat when Lemonade Server up + LLM GGUF downloaded.
 */

export {
  ADAPTER_ID,
  PROVIDER_ID,
  DEFAULT_CHAT_MODEL,
  PREFERRED_CHAT_MODELS,
  DEFAULT_BASE_CANDIDATES,
  LemonadeSdkChatClient,
  resolveLemonadeSdkBaseCandidates,
  isLlmModel,
  mapModel,
  tcpReachable,
  fetchJson,
  authHeaders,
  sdkError,
  probeLemonadeSdk,
  chatViaLemonadeSdk,
  reportLemonadeSdkCapability,
  writeSdkCapabilityReport,
} from "./lemonadeSdkChatAdapter.js";

export { default } from "./lemonadeSdkChatAdapter.js";
