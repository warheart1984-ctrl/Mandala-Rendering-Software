/**
 * Package-boundary shim for the Evidence Chain.
 * Re-exports the canonical implementation with a default export
 * for CJS consumers (`require(...).default`).
 */

import { EvidenceChain } from "../renderer-core/src/fmce/evidence/EvidenceChain.js";

export default EvidenceChain;
export { EvidenceChain };
