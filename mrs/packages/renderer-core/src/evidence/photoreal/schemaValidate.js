/**
 * Lean JSON-Schema smoke validator for CIEMS photoreal artifacts.
 * STATUS: **partial** — required keys + const fields + id patterns; not full draft-2020-12.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo schemas/ciems relative to this file: …/renderer-core/src/evidence/photoreal → repo root */
export function resolveCiemsSchemaDir(repoRoot) {
  if (repoRoot) return join(repoRoot, "schemas", "ciems");
  return join(__dirname, "../../../../../../schemas/ciems");
}

/**
 * @param {object} doc
 * @param {object} schema
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateAgainstSchema(doc, schema) {
  const errors = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { ok: false, errors: ["document must be an object"] };
  }

  const required = schema.required || [];
  for (const key of required) {
    if (!(key in doc) || doc[key] === undefined) {
      errors.push(`missing required: ${key}`);
    }
  }

  const props = schema.properties || {};
  for (const [key, propSchema] of Object.entries(props)) {
    if (!(key in doc) || doc[key] === undefined) continue;
    const val = doc[key];
    if (propSchema.const !== undefined && val !== propSchema.const) {
      errors.push(`${key}: expected const ${JSON.stringify(propSchema.const)}`);
    }
    if (propSchema.pattern && typeof val === "string") {
      const re = new RegExp(propSchema.pattern);
      if (!re.test(val)) {
        errors.push(`${key}: does not match ${propSchema.pattern}`);
      }
    }
    if (propSchema.type) {
      const types = Array.isArray(propSchema.type)
        ? propSchema.type
        : [propSchema.type];
      if (!types.includes("null") || val !== null) {
        if (!types.some((t) => typeMatches(val, t))) {
          // allow null only when listed
          if (!(val === null && types.includes("null"))) {
            errors.push(
              `${key}: type mismatch (got ${val === null ? "null" : typeof val})`,
            );
          }
        }
      }
    }
    if (
      propSchema.enum &&
      val !== undefined &&
      val !== null &&
      !propSchema.enum.includes(val)
    ) {
      errors.push(`${key}: not in enum`);
    }
    if (
      typeof propSchema.minimum === "number" &&
      typeof val === "number" &&
      val < propSchema.minimum
    ) {
      errors.push(`${key}: below minimum ${propSchema.minimum}`);
    }
    if (
      typeof propSchema.maximum === "number" &&
      typeof val === "number" &&
      val > propSchema.maximum
    ) {
      errors.push(`${key}: above maximum ${propSchema.maximum}`);
    }
  }

  // Nested required for known blocks
  if (schema.$id?.includes("pep-v1") && doc.authorityRecord) {
    for (const k of ["renderer", "sceneIdentityHash"]) {
      if (!(k in doc.authorityRecord)) {
        errors.push(`authorityRecord missing ${k}`);
      }
    }
  }
  if (schema.$id?.includes("spr-v1") && doc.sceneIdentityBlock) {
    for (const k of ["sceneUUID", "glbHash"]) {
      if (!(k in doc.sceneIdentityBlock)) {
        errors.push(`sceneIdentityBlock missing ${k}`);
      }
    }
  }
  if (schema.$id?.includes("cec-v1") && doc.bindings) {
    for (const k of ["pep", "spr"]) {
      if (!(k in doc.bindings)) errors.push(`bindings missing ${k}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function typeMatches(val, t) {
  if (t === "null") return val === null;
  if (t === "array") return Array.isArray(val);
  if (t === "integer") return Number.isInteger(val);
  if (t === "number") return typeof val === "number" && Number.isFinite(val);
  if (t === "object") {
    return val !== null && typeof val === "object" && !Array.isArray(val);
  }
  return typeof val === t;
}

/**
 * @param {string} name pep-v1 | spr-v1 | cec-v1 | …
 * @param {string} [repoRoot]
 */
export function loadCiemsSchema(name, repoRoot) {
  const dir = resolveCiemsSchemaDir(repoRoot);
  const file = name.endsWith(".json") ? name : `${name}.json`;
  const path = join(dir, file);
  if (!existsSync(path)) {
    throw new Error(`CIEMS schema missing: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * @param {object} doc
 * @param {'pep'|'spr'|'cec'|'rdc'|'mfp-c'|'ljc'} kind
 * @param {string} [repoRoot]
 */
export function validateCiemsDoc(doc, kind, repoRoot) {
  const map = {
    pep: "pep-v1",
    spr: "spr-v1",
    cec: "cec-v1",
    rdc: "rdc-v1",
    "mfp-c": "mfp-c-v1",
    ljc: "ljc-v1",
  };
  const schema = loadCiemsSchema(map[kind] || kind, repoRoot);
  return validateAgainstSchema(doc, schema);
}
