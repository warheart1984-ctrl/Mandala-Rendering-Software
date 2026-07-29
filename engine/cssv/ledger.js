/**
 * CSSV ledger loader — re-exports browser-safe paths + Node persistence API.
 *
 * Browser bundles should import `./ledgerPaths.js` or `CssvRegistry` only.
 * Node scripts (cssv/server, CQL) may import this barrel.
 */

export { ledgerPaths } from "./ledgerPaths.js";
export {
  isNodeLedgerHost,
  ensureLedgerInitialized,
  loadArtifacts,
  loadNdjson,
  loadLedger,
  appendNdjson,
  appendNdjsonBatch,
  saveArtifacts,
  mergeArtifacts,
} from "./ledgerNode.js";
