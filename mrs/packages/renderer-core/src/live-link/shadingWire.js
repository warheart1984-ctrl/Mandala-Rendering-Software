/**
 * LiveLink JSON wire for ShadingInput4D inspection messages.
 * Status: partial — transport + field validation only; not Shade4D / BVH.
 * Port default: LiveLinkServer 9487 (ws://127.0.0.1:9487).
 */

export const SHADING_UPDATE_TYPE = 'shading_update';
export const SHADING_WIRE_SCHEMA_VERSION = '1.0';
export const SHADING_WIRE_ROLE = 'inspection';

/** Host SoT mirrors (Unity FourDObservationModeMap / Unreal FourDRendererV2). */
export const OBSERVATION_MODE_IDS = Object.freeze({
  PERSPECTIVE_4D_TO_3D: '0x1000000000000001',
  W_SLICE_CONSTANT: '0x1000000000000002',
});

export const PROJECTION_POLICY_IDS = Object.freeze({
  PERSPECTIVE_4D_TO_3D: 0,
  SLICE_W_CONSTANT: 1,
  STEREOGRAPHIC_4D_TO_3D: 2,
});

/** @typedef {'Perspective4DTo3D'|'WSliceConstant'} ObservationModeChoiceName */

/**
 * @param {ObservationModeChoiceName|string|number} choice
 * @returns {{ observationModeId: string, projectionPolicyId: number }}
 */
export function mapObservationModeChoice(choice) {
  const key =
    typeof choice === 'number'
      ? choice === 1
        ? 'WSliceConstant'
        : 'Perspective4DTo3D'
      : String(choice);

  switch (key) {
    case 'WSliceConstant':
    case '1':
      return {
        observationModeId: OBSERVATION_MODE_IDS.W_SLICE_CONSTANT,
        projectionPolicyId: PROJECTION_POLICY_IDS.SLICE_W_CONSTANT,
      };
    case 'Perspective4DTo3D':
    case '0':
    default:
      return {
        observationModeId: OBSERVATION_MODE_IDS.PERSPECTIVE_4D_TO_3D,
        projectionPolicyId: PROJECTION_POLICY_IDS.PERSPECTIVE_4D_TO_3D,
      };
  }
}

/**
 * Normalize uint64-ish id to canonical hex string used on the wire.
 * @param {string|number|bigint} value
 * @returns {string}
 */
export function normalizeObservationModeId(value) {
  if (typeof value === 'bigint') {
    return `0x${value.toString(16)}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `0x${Math.trunc(value).toString(16)}`;
  }
  const s = String(value).trim().toLowerCase();
  if (/^0x[0-9a-f]+$/.test(s)) return s;
  if (/^[0-9]+$/.test(s)) {
    try {
      return `0x${BigInt(s).toString(16)}`;
    } catch {
      return s;
    }
  }
  return s;
}

/**
 * @param {object} entry
 * @returns {string[]}
 */
function validateShadingEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') {
    return ['entry must be object'];
  }
  for (const key of ['Position4D', 'Normal4D', 'ViewDir4D']) {
    if (!Array.isArray(entry[key]) || entry[key].length !== 4) {
      errors.push(`${key} must be float[4]`);
    } else if (!entry[key].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      errors.push(`${key} must be finite numbers`);
    }
  }
  if (typeof entry.MaterialId !== 'number' || !Number.isInteger(entry.MaterialId) || entry.MaterialId < 0) {
    errors.push('MaterialId must be non-negative int');
  }
  if (
    typeof entry.ProjectionPolicyId !== 'number' ||
    !Number.isInteger(entry.ProjectionPolicyId) ||
    entry.ProjectionPolicyId < 0
  ) {
    errors.push('ProjectionPolicyId must be non-negative int');
  }
  return errors;
}

/**
 * Validate a shading_update LiveLink JSON object.
 * @param {unknown} msg
 * @param {{ requireEntries?: boolean, maxEntries?: number }} [opts]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateShadingUpdateMessage(msg, opts = {}) {
  const requireEntries = opts.requireEntries !== false;
  const maxEntries = opts.maxEntries ?? 4096;
  /** @type {string[]} */
  const errors = [];

  if (!msg || typeof msg !== 'object') {
    return { ok: false, errors: ['message must be object'] };
  }
  const m = /** @type {Record<string, unknown>} */ (msg);

  if (m.type !== SHADING_UPDATE_TYPE) {
    errors.push(`type must be ${SHADING_UPDATE_TYPE}`);
  }
  if (m.schemaVersion !== SHADING_WIRE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SHADING_WIRE_SCHEMA_VERSION}`);
  }
  if (m.role != null && m.role !== SHADING_WIRE_ROLE) {
    errors.push(`role must be ${SHADING_WIRE_ROLE}`);
  }

  const obsId = normalizeObservationModeId(/** @type {string|number|bigint} */ (m.observationModeId ?? ''));
  const allowedIds = new Set(Object.values(OBSERVATION_MODE_IDS));
  if (!allowedIds.has(obsId)) {
    errors.push(`observationModeId must be one of ${[...allowedIds].join(', ')}`);
  }

  if (typeof m.projectionPolicyId !== 'number' || !Number.isInteger(m.projectionPolicyId)) {
    errors.push('projectionPolicyId must be int');
  } else {
    const mapped = [...Object.values(OBSERVATION_MODE_IDS)].includes(obsId)
      ? Object.entries(OBSERVATION_MODE_IDS).find(([, v]) => v === obsId)?.[0]
      : null;
    if (mapped === 'PERSPECTIVE_4D_TO_3D' && m.projectionPolicyId !== 0) {
      errors.push('observationModeId PERSPECTIVE requires projectionPolicyId 0');
    }
    if (mapped === 'W_SLICE_CONSTANT' && m.projectionPolicyId !== 1) {
      errors.push('observationModeId W_SLICE requires projectionPolicyId 1');
    }
  }

  if (typeof m.count !== 'number' || !Number.isInteger(m.count) || m.count < 0) {
    errors.push('count must be non-negative int');
  }

  const entries = m.entries;
  if (requireEntries) {
    if (!Array.isArray(entries)) {
      errors.push('entries must be array');
    } else {
      if (typeof m.count === 'number' && m.count !== entries.length) {
        errors.push('count must equal entries.length');
      }
      if (entries.length > maxEntries) {
        errors.push(`entries length exceeds maxEntries (${maxEntries})`);
      }
      for (let i = 0; i < entries.length; i++) {
        for (const e of validateShadingEntry(entries[i])) {
          errors.push(`entries[${i}]: ${e}`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Build a deterministic shading_update payload (inspection/demo).
 * @param {object} opts
 * @param {ObservationModeChoiceName|string|number} [opts.observationMode]
 * @param {string} [opts.surfaceId]
 * @param {number} [opts.frame]
 * @param {number} [opts.materialId]
 * @param {Array<{Position4D:number[],Normal4D:number[],ViewDir4D:number[],MaterialId?:number,ProjectionPolicyId?:number}>} [opts.entries]
 * @returns {object}
 */
export function buildShadingUpdateMessage(opts = {}) {
  const mapped = mapObservationModeChoice(opts.observationMode ?? 'Perspective4DTo3D');
  const materialId = opts.materialId ?? 0;
  const entries = (opts.entries ?? [
    {
      Position4D: [1, 0, 0, 0],
      Normal4D: [0, 0, 0, 1],
      ViewDir4D: [0, 0, 1, 0],
      MaterialId: materialId,
      ProjectionPolicyId: mapped.projectionPolicyId,
    },
  ]).map((e) => ({
    Position4D: e.Position4D,
    Normal4D: e.Normal4D,
    ViewDir4D: e.ViewDir4D,
    MaterialId: e.MaterialId ?? materialId,
    ProjectionPolicyId: e.ProjectionPolicyId ?? mapped.projectionPolicyId,
  }));

  return {
    type: SHADING_UPDATE_TYPE,
    schemaVersion: SHADING_WIRE_SCHEMA_VERSION,
    role: SHADING_WIRE_ROLE,
    surfaceId: opts.surfaceId ?? 'tesseract',
    frame: opts.frame ?? 0,
    observationModeId: mapped.observationModeId,
    projectionPolicyId: mapped.projectionPolicyId,
    materialId,
    count: entries.length,
    entries,
  };
}
