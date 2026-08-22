/**
 * ISA bridge ops — ENFORCED telemetry path (v2.2-fx8350-polaris).
 *
 * Measurable emulation_faults counter + rate window so eco throttle
 * (>100 faults/sec → drop 1 hop, pbn_grid_size 32→40) feeds denser worker
 * + silicon-tuner. Not a claim of live AVX2 silicon on FX-8350.
 *
 * STATUS: enforced (counter + tuner feed); hardware bridge = absent.
 */

/** Faults per second that triggers eco densify throttle. */
export const ISA_FAULT_THROTTLE_PER_SEC = 100;

/** Eco PBN grid after ISA fault throttle (coarser → ~200–300 quads cheaper). */
export const PBN_GRID_ECO_ISA_FAULT = 40;

/** Nominal thermal PBN on amd_legacy_profile under non-critical heat. */
export const PBN_GRID_THERMAL_NOMINAL = 32;

/**
 * Build enforced ISA bridge ops log with countable fault window.
 *
 * @param {object} [opts]
 * @param {number} [opts.emulation_faults] absolute faults in window
 * @param {number} [opts.window_ms] observation window (default 1000)
 * @param {number} [opts.fault_rate_per_sec] optional precomputed rate
 * @param {number} [opts.emulation_faults_per_sec] alias used by denser worker patch
 * @param {string} [opts.intentId]
 * @param {string} [opts.mode]
 */
export function buildIsaBridgeOpsStub(opts = {}) {
  const window_ms = Math.max(1, Number(opts.window_ms) || 1000);
  const emulation_faults = Math.max(0, Number(opts.emulation_faults) || 0);
  const fault_rate_per_sec = Number.isFinite(opts.fault_rate_per_sec)
    ? Number(opts.fault_rate_per_sec)
    : Number.isFinite(opts.emulation_faults_per_sec)
      ? Number(opts.emulation_faults_per_sec)
      : (emulation_faults / window_ms) * 1000;

  return {
    status: "enforced",
    ops: Array.isArray(opts.ops) ? opts.ops : [],
    note:
      "ISA bridge ops ENFORCED as measurable counters feeding denser/tuner — FX-8350 has no native AVX2; software path only",
    emulation_faults,
    emulation_faults_per_sec: fault_rate_per_sec,
    window_ms,
    fault_rate_per_sec,
    intentId: opts.intentId || null,
    mode: opts.mode || null,
  };
}

/**
 * Measure faults/sec from ops fields (testable without hardware).
 */
export function measureIsaFaultRate(isaBridgeOps = {}) {
  if (Number.isFinite(isaBridgeOps.emulation_faults_per_sec)) {
    return Number(isaBridgeOps.emulation_faults_per_sec);
  }
  if (Number.isFinite(isaBridgeOps.fault_rate_per_sec)) {
    return Number(isaBridgeOps.fault_rate_per_sec);
  }
  const faults = Math.max(0, Number(isaBridgeOps.emulation_faults) || 0);
  const windowMs = Math.max(1, Number(isaBridgeOps.window_ms) || 1000);
  return (faults / windowMs) * 1000;
}

/**
 * Eco path when emulation_faults rate exceeds 100/sec:
 *   - drop 1 hop
 *   - bump pbn_grid_size 32 → 40 (~200–300 quads cheaper)
 *
 * Does NOT mutate actor topology / densify body hashes — hop + grid only.
 */
export function applyIsaFaultEcoThrottle(input = {}) {
  const hopIn = Number.isFinite(input.hopLimit) ? input.hopLimit : 6;
  const gridIn = Number.isFinite(input.pbnGridSize)
    ? input.pbnGridSize
    : PBN_GRID_THERMAL_NOMINAL;
  const isa = input.isaBridgeOps || buildIsaBridgeOpsStub();
  const fault_rate_per_sec = measureIsaFaultRate(isa);
  const triggered = fault_rate_per_sec > ISA_FAULT_THROTTLE_PER_SEC;

  if (!triggered) {
    return {
      hopLimit: hopIn,
      pbnGridSize: gridIn,
      isaFaultThrottle: false,
      fault_rate_per_sec,
      reason: "isa_fault_rate_nominal",
      status: "enforced",
      topology_hash_stable: true,
      payload_body_hash_stable: true,
      isa_bridge_ops: isa,
    };
  }

  return {
    hopLimit: Math.max(1, hopIn - 1),
    pbnGridSize: PBN_GRID_ECO_ISA_FAULT,
    isaFaultThrottle: true,
    fault_rate_per_sec,
    reason: "isa_emulation_faults_gt_100_per_sec",
    status: "enforced",
    note:
      "Eco densify: −1 hop, pbn_grid_size 32→40 (~200–300 quads cheaper). Actor topology_hash / body payload_hash unchanged.",
    topology_hash_stable: true,
    payload_body_hash_stable: true,
    isa_bridge_ops: isa,
  };
}
