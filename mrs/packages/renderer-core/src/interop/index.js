/**
 * FourDRenderer v2 interop surface (JS mirror).
 * Status: declared — field-name SoT for tests; does not implement BVH traversal or shading kernels.
 * RFC: docs/4d-engine/v2/bvh-projection · observation · materials · shader-abi
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {typeof import('./fourd-shading-types.json')} */
export const fourdShadingTypesSchema = JSON.parse(
  readFileSync(join(__dirname, 'fourd-shading-types.json'), 'utf8'),
);

export const REQUIRED_STRUCT_NAMES = [
  'Primitive4D',
  'EmbeddedSurface4D',
  'BVHNode4D',
  'BVH4D',
  'Ray4D',
  'Hit4D',
  'ShadingInput4D',
  'ShadingOutput3D',
  'ObservationModeId',
  'ObservationModeDesc',
  'Material4DDesc',
];

/** Documented StructuredBuffer strides (HLSL SoT). */
export const STRIDES_BYTES = Object.freeze({
  ...fourdShadingTypesSchema.stridesBytes,
});

export const PROJECTION_POLICY = Object.freeze({
  PERSPECTIVE_4D_TO_3D: 0,
  SLICE_W_CONSTANT: 1,
  STEREOGRAPHIC_4D_TO_3D: 2,
});

/**
 * @param {string} structName
 * @returns {string[]}
 */
export function fieldNamesOf(structName) {
  const entry = fourdShadingTypesSchema.structs[structName];
  if (!entry?.fields) return [];
  return entry.fields.map((f) => f.name);
}

/**
 * Smoke: every required RFC struct is present with non-empty fields.
 * @returns {{ ok: boolean, missing: string[], emptyFields: string[] }}
 */
export function validateInteropSchema() {
  const missing = [];
  const emptyFields = [];
  for (const name of REQUIRED_STRUCT_NAMES) {
    const entry = fourdShadingTypesSchema.structs[name];
    if (!entry) {
      missing.push(name);
      continue;
    }
    if (!Array.isArray(entry.fields) || entry.fields.length === 0) {
      emptyFields.push(name);
    }
  }
  return { ok: missing.length === 0 && emptyFields.length === 0, missing, emptyFields };
}
