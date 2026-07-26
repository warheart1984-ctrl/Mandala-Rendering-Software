import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_STRUCT_NAMES,
  STRIDES_BYTES,
  PROJECTION_POLICY,
  fieldNamesOf,
  fourdShadingTypesSchema,
  validateInteropSchema,
} from './index.js';

describe('fourd interop schema (declared)', () => {
  it('lists all RFC structs with fields', () => {
    const result = validateInteropSchema();
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(REQUIRED_STRUCT_NAMES.length, 11);
  });

  it('ShadingInput4D matches BVH RFC field names', () => {
    assert.deepEqual(fieldNamesOf('ShadingInput4D'), [
      'Position4D',
      'Normal4D',
      'ViewDir4D',
      'MaterialId',
      'ProjectionPolicyId',
    ]);
    assert.equal(STRIDES_BYTES.ShadingInput4D, 56);
  });

  it('ObservationModeDesc / Material4DDesc match RFCs', () => {
    assert.deepEqual(fieldNamesOf('ObservationModeId'), ['Value']);
    assert.deepEqual(fieldNamesOf('ObservationModeDesc'), [
      'Id',
      'ProjectionPolicyId',
      'PathRoutingPolicyId',
      'VisibilityPolicyId',
      'BlendPolicyId',
      'WSliceMin',
      'WSliceMax',
    ]);
    assert.deepEqual(fieldNamesOf('Material4DDesc'), [
      'MaterialId',
      'BSDFType',
      'Use4DShading',
      'UseHybridShading',
      'BaseColor',
      'Roughness',
      'WAnisotropy',
    ]);
  });

  it('Primitive4D / BVHNode4D field presence', () => {
    assert.ok(fieldNamesOf('Primitive4D').includes('ProjectionPolicyId'));
    assert.ok(fieldNamesOf('BVHNode4D').includes('FirstChildOrPrim'));
    assert.ok(fieldNamesOf('Hit4D').includes('Hit'));
    assert.equal(PROJECTION_POLICY.SLICE_W_CONSTANT, 1);
  });

  it('status tags stay evidence-bound', () => {
    assert.equal(fourdShadingTypesSchema.status, 'declared');
    assert.equal(fourdShadingTypesSchema.hostBindings.unityShadingBuffer.status, 'partial');
    assert.equal(fourdShadingTypesSchema.hostBindings.unrealLiveLinkSendShadingData.status, 'skeleton');
    assert.equal(fourdShadingTypesSchema.observationModeIds.Perspective4DTo3D, '0x1000000000000001');
    assert.equal(fourdShadingTypesSchema.observationModeIds.WSliceConstant, '0x1000000000000002');
    assert.equal(fourdShadingTypesSchema.liveLinkShadingWire.status, 'partial');
  });
});
