import type { VisualMod } from "../substrate/VisualMod.js";

export type GovernanceSeverity = "info" | "warn" | "critical";

export interface GovernanceSignal {
  id: string;
  severity: GovernanceSeverity;
  message: string;
  position3D: [number, number, number];
}

export interface CIEMSOverlay {
  applySignals(signals: GovernanceSignal[], visualMod: VisualMod): VisualMod;
}

/**
 * Pure overlay helper — **partial** (unit-tested; not wired into EngineHost tick).
 */
export class DefaultCIEMSOverlay implements CIEMSOverlay {
  applySignals(signals: GovernanceSignal[], visualMod: VisualMod): VisualMod {
    const colors = visualMod.colors.slice();
    const scales = visualMod.scales.slice();
    const shaderParams = { ...visualMod.shaderParams };
    let criticalCount = 0;
    for (const s of signals) {
      if (s.severity === "critical") criticalCount += 1;
    }
    shaderParams["governanceCriticalCount"] = criticalCount;
    shaderParams["governanceSignalCount"] = signals.length;
    return { colors, scales, shaderParams };
  }
}
