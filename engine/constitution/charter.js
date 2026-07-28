/**
 * Machine-readable Constitutional Engine Charter (4DCE).
 * SoT under engine/ — js/constitution re-exports this module.
 * Only fields marked status:"enforced" are runtime gates.
 */

export const CHARTER = Object.freeze({
  id: "charter.4dce.v1",
  version: "1.0.0",
  name: "4D Cinematic Engine — Constitutional Charter",
  purpose: [
    "Governed cognitive runtime for 4D cinematic render and export",
    "Evidence-bound state transitions for significant artifacts",
    "Session provenance for decisions, renders, and exports",
  ],
  principles: Object.freeze([
    {
      id: "no-execution-without-intent",
      status: "enforced",
      text: "Every governed operation originates from a declared intent record.",
    },
    {
      id: "no-state-change-without-evidence",
      status: "enforced",
      text: "Every governed mutation is backed by verifiable evidence.",
    },
    {
      id: "no-authority-without-contract",
      status: "enforced",
      text: "Every actor operates under a defined constitutional contract.",
    },
    {
      id: "replayable-reality",
      status: "partial",
      text: "Significant decisions and renders are replayable via TRT (params today).",
    },
    {
      id: "sovereign-independence",
      status: "declared",
      text: "Engine independence from vendors, languages, and clouds (roadmap).",
    },
  ]),
  organs: Object.freeze({
    governanceKernel: { id: "organ.gk", status: "enforced" },
    cse: { id: "organ.cse", status: "enforced" },
    isl: { id: "organ.isl", status: "partial" },
    evidenceLayer: { id: "organ.evidence", status: "partial" },
    ckl: { id: "organ.ckl", status: "enforced" },
  }),
  /** Geometric invariants for the cinematic 4D renderer. */
  cinematic4d: Object.freeze({
    contractId: "contract.cinematic4d.v1",
    vertexCount: 16,
    edgeCount: 32,
    coordDomain: [-1, 1],
    rotationPlanes: ["XY", "XZ", "XW", "YZ", "YW", "ZW"],
    activePlanes: ["XW", "YZ", "ZW", "YW"],
    projection: Object.freeze({
      formula4to3: "p' = d4/(d4-w) * (x,y,z)",
      formula3to2: "P = d3/(d3-z') * (x',y')",
    }),
  }),
});

export function enforcedPrinciples() {
  return CHARTER.principles.filter((p) => p.status === "enforced");
}
