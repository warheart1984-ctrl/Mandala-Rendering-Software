/**
 * Package-boundary shim for the Command Proposal Protocol.
 * Re-exports the canonical implementation with a default export
 * for CJS consumers (`require(...).default`).
 */

import { CommandProposalProtocol } from "../renderer-core/src/fmce/cpp/CommandProposalProtocol.js";

export default CommandProposalProtocol;
export { CommandProposalProtocol };
