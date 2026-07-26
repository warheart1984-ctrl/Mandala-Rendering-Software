import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OBSERVATION_MODE_IDS,
  PROJECTION_POLICY_IDS,
  mapObservationModeChoice,
  normalizeObservationModeId,
  validateShadingUpdateMessage,
  buildShadingUpdateMessage,
  SHADING_UPDATE_TYPE,
} from './shadingWire.js';

describe('shadingWire LiveLink contract', () => {
  it('maps ObservationModeChoice to RFC-aligned host IDs', () => {
    assert.deepEqual(mapObservationModeChoice('Perspective4DTo3D'), {
      observationModeId: OBSERVATION_MODE_IDS.PERSPECTIVE_4D_TO_3D,
      projectionPolicyId: PROJECTION_POLICY_IDS.PERSPECTIVE_4D_TO_3D,
    });
    assert.deepEqual(mapObservationModeChoice('WSliceConstant'), {
      observationModeId: OBSERVATION_MODE_IDS.W_SLICE_CONSTANT,
      projectionPolicyId: PROJECTION_POLICY_IDS.SLICE_W_CONSTANT,
    });
    assert.equal(mapObservationModeChoice(0).projectionPolicyId, 0);
    assert.equal(mapObservationModeChoice(1).observationModeId, OBSERVATION_MODE_IDS.W_SLICE_CONSTANT);
  });

  it('normalizes observationModeId hex forms', () => {
    assert.equal(
      normalizeObservationModeId('0x1000000000000001'),
      OBSERVATION_MODE_IDS.PERSPECTIVE_4D_TO_3D,
    );
    assert.equal(
      normalizeObservationModeId(BigInt('0x1000000000000002')),
      OBSERVATION_MODE_IDS.W_SLICE_CONSTANT,
    );
  });

  it('buildShadingUpdateMessage validates', () => {
    const msg = buildShadingUpdateMessage({
      observationMode: 'WSliceConstant',
      surfaceId: 'tesseract',
      frame: 3,
    });
    assert.equal(msg.type, SHADING_UPDATE_TYPE);
    assert.equal(msg.observationModeId, OBSERVATION_MODE_IDS.W_SLICE_CONSTANT);
    assert.equal(msg.projectionPolicyId, 1);
    const check = validateShadingUpdateMessage(msg);
    assert.equal(check.ok, true, JSON.stringify(check.errors));
  });

  it('rejects mismatched observation / projection pairing', () => {
    const msg = buildShadingUpdateMessage({ observationMode: 'Perspective4DTo3D' });
    msg.projectionPolicyId = 1;
    const check = validateShadingUpdateMessage(msg);
    assert.equal(check.ok, false);
    assert.ok(check.errors.some((e) => e.includes('projectionPolicyId')));
  });

  it('rejects missing required ShadingInput4D fields', () => {
    const msg = buildShadingUpdateMessage();
    msg.entries = [{ Position4D: [0, 0, 0, 0] }];
    msg.count = 1;
    const check = validateShadingUpdateMessage(msg);
    assert.equal(check.ok, false);
  });
});
