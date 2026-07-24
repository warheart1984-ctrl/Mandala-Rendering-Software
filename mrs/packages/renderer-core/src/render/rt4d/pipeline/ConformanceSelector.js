/**
 * Conformance preferences — Phase B is record-optional (not CKL hard-fail).
 *
 * @typedef {object} ConformanceProfile
 * @property {boolean} recordCurvatureEvidence
 * @property {boolean} recordRhiEvidence
 * @property {boolean} recordGpuEvidence
 * @property {boolean} preferDeterminism
 * @property {boolean} enforceCurvatureEvidence
 * @property {boolean} enforceRhiEvidence
 * @property {boolean} enforceGpuEvidence
 * @property {boolean} enforceDeterminism
 */

/**
 * Defaults: record preferred, enforce false until CSSV probes exist.
 * @returns {ConformanceProfile}
 */
export function selectConformanceProfile() {
  return {
    recordCurvatureEvidence: true,
    recordRhiEvidence: true,
    recordGpuEvidence: true,
    preferDeterminism: true,
    enforceCurvatureEvidence: false,
    enforceRhiEvidence: false,
    enforceGpuEvidence: false,
    enforceDeterminism: false,
  };
}
