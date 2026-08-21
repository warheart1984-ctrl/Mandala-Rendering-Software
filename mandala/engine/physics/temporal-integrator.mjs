/**
 * Temporal integrator — steps certified state by proposing t→t+1.
 * Not pose-lerp. Uses proto η + lattice Hamiltonian (−∇H) + −∇φ defect walk.
 * Status: **partial** (tiny lattice, CPU).
 */

import { cpuProposeNext, createProposalBuffers } from "../../proto/cpu-reference.mjs";
import { resolveDefectCollision } from "./collision-manifold.mjs";

export const INTEGRATOR_STATUS = "partial";
export const INTEGRATOR_DRIVER = "cpu_reference_transport";
export const INTEGRATOR_OPERATOR = "lattice-hamiltonian";

export function createIntegratorBuffers(shape) {
  return createProposalBuffers(shape);
}

/**
 * Integrate one certified dt. Writes proposal buffers; does not commit.
 * Applies collision bounce so the lawful proposal stays in-domain.
 */
export function integrateNext(certified, constitution, out, { occupied = [] } = {}) {
  cpuProposeNext(certified, constitution, out);
  const bounced = resolveDefectCollision(
    certified.defect,
    out.defect,
    certified.shape,
    occupied,
  );
  out.defect = bounced.defect;
  out.collision = bounced;
  return out;
}
