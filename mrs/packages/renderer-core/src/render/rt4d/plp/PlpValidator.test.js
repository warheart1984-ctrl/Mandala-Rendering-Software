// mrs/packages/renderer-core/src/render/rt4d/plp/PlpValidator.test.js
// Status: **partial** — PLP v2 validator tests (required fields, wave rules, error handling).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorldDocumentV2, PlpValidator } from './PlpValidator.js';

test('validateWorldDocumentV2 rejects non-object input', () => {
  assert.throws(() => validateWorldDocumentV2(null), /worldDoc must be an object/);
  assert.throws(() => validateWorldDocumentV2("string"), /worldDoc must be an object/);
  assert.throws(() => validateWorldDocumentV2(123), /worldDoc must be an object/);
});

test('validateWorldDocumentV2 requires version 2.0', () => {
  const doc = { version: "1.0", metadata: {}, lineage: {}, geometry: {}, materials: {}, render: {} };
  assert.throws(() => validateWorldDocumentV2(doc), /version must be "2.0"/);
});

test('validateWorldDocumentV2 accepts version 2.0', () => {
  const doc = { version: "2.0", metadata: {}, lineage: {}, geometry: {}, materials: {}, render: {} };
  const result = validateWorldDocumentV2(doc);
  assert.equal(result.valid, true);
});

test('validateWorldDocumentV2 requires all six top-level fields', () => {
  const base = { version: "2.0" };
  for (const key of ["metadata", "lineage", "geometry", "materials", "render"]) {
    const doc = { ...base };
    delete doc[key];
    assert.throws(() => validateWorldDocumentV2(doc), new RegExp(`missing or invalid required field: ${key}`));
  }
});

test('validateWorldDocumentV2 validates wave gridSize when enabled', () => {
  const doc = {
    version: "2.0",
    metadata: {},
    lineage: {},
    geometry: {},
    materials: {},
    render: {},
    wave: { enabled: true, gridSize: { nx: 16, ny: -1, nz: 16 } },
  };
  assert.throws(() => validateWorldDocumentV2(doc), /wave.gridSize.ny must be a positive integer/);
});

test('validateWorldDocumentV2 validates wave.c and wave.dt when enabled', () => {
  const doc = {
    version: "2.0",
    metadata: {},
    lineage: {},
    geometry: {},
    materials: {},
    render: {},
    wave: { enabled: true, gridSize: { nx: 8, ny: 8, nz: 8 }, c: -1, dt: 0 },
  };
  assert.throws(() => validateWorldDocumentV2(doc), /wave.c must be a finite number > 0/);
  assert.throws(() => validateWorldDocumentV2(doc), /wave.dt must be a finite number > 0/);
});

test('validateWorldDocumentV2 validates wave.beta and wave.gamma', () => {
  const doc = {
    version: "2.0",
    metadata: {},
    lineage: {},
    geometry: {},
    materials: {},
    render: {},
    wave: { enabled: true, gridSize: { nx: 8, ny: 8, nz: 8 }, c: 1, dt: 0.01, beta: NaN, gamma: Infinity },
  };
  assert.throws(() => validateWorldDocumentV2(doc), /wave.beta must be finite/);
  assert.throws(() => validateWorldDocumentV2(doc), /wave.gamma must be finite/);
});

test('validateWorldDocumentV2 validates wave.waveDir', () => {
  const doc = {
    version: "2.0",
    metadata: {},
    lineage: {},
    geometry: {},
    materials: {},
    render: {},
    wave: { enabled: true, gridSize: { nx: 8, ny: 8, nz: 8 }, c: 1, dt: 0.01, waveDir: { x: 1, y: NaN, z: 0 } },
  };
  assert.throws(() => validateWorldDocumentV2(doc), /wave.waveDir components must be finite/);
});

test('validateWorldDocumentV2 rejects zero waveDir', () => {
  const doc = {
    version: "2.0",
    metadata: {},
    lineage: {},
    geometry: {},
    materials: {},
    render: {},
    wave: { enabled: true, gridSize: { nx: 8, ny: 8, nz: 8 }, c: 1, dt: 0.01, waveDir: { x: 0, y: 0, z: 0 } },
  };
  assert.throws(() => validateWorldDocumentV2(doc), /wave.waveDir must be non-zero/);
});

test('validateWorldDocumentV2 returns valid result when all checks pass', () => {
  const doc = {
    version: "2.0",
    metadata: {},
    lineage: {},
    geometry: {},
    materials: {},
    render: {},
    wave: {
      enabled: true,
      gridSize: { nx: 16, ny: 16, nz: 16 },
      c: 1.0,
      dt: 0.01,
      beta: 0.5,
      gamma: 0.1,
      waveDir: { x: 0, y: 1, z: 0 },
    },
  };
  const result = validateWorldDocumentV2(doc);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.ok(Array.isArray(result.warnings));
});

test('PlpValidator class wraps validate function', () => {
  const validator = new PlpValidator();
  const doc = {
    version: "2.0",
    metadata: {},
    lineage: {},
    geometry: {},
    materials: {},
    render: {},
  };
  const result = validator.validate(doc);
  assert.equal(result.valid, true);
});

test('PlpValidator throws PlpValidationError with errors array', () => {
  const validator = new PlpValidator();
  const doc = { version: "1.0", metadata: {}, lineage: {}, geometry: {}, materials: {}, render: {} };
  try {
    validator.validate(doc);
    assert.fail("should have thrown");
  } catch (e) {
    assert.equal(e.name, "PlpValidationError");
    assert.ok(Array.isArray(e.errors));
    assert.ok(e.errors.length > 0);
  }
});