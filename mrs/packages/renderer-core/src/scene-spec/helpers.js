/**
 * SceneSpecification — thin structured validation helpers.
 * Aligned with @mrs/scene-schema WorldDocument field rules (Drive-G-1):
 * renderer-core stays plain JS without a hard tsc dependency on scene-schema.
 */

/** @typedef {{ path: string, message: string }} ValidationIssue */
/** @typedef {{ ok: true, value: any } | { ok: false, errors: ValidationIssue[] }} ValidationResult */

export function joinPath(base, key) {
  if (base === "" || base == null) return String(key);
  if (typeof key === "number") return `${base}[${key}]`;
  return `${base}.${key}`;
}

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** @returns {ValidationResult} */
export function ok(value) {
  return { ok: true, value };
}

/** @returns {ValidationResult} */
export function fail(errors) {
  return { ok: false, errors };
}

export function expectObject(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push({ path: path || "", message: "expected object" });
    return null;
  }
  return value;
}

export function expectString(value, path, errors, opts = {}) {
  if (typeof value !== "string") {
    errors.push({ path, message: "expected string" });
    return null;
  }
  if (opts.nonEmpty && value.length === 0) {
    errors.push({ path, message: "expected non-empty string" });
    return null;
  }
  return value;
}

export function expectFiniteNumber(value, path, errors, opts = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push({ path, message: "expected finite number" });
    return null;
  }
  if (opts.integer && !Number.isInteger(value)) {
    errors.push({ path, message: "expected integer" });
    return null;
  }
  if (opts.min != null && value < opts.min) {
    errors.push({ path, message: `expected >= ${opts.min}` });
    return null;
  }
  if (opts.max != null && value > opts.max) {
    errors.push({ path, message: `expected <= ${opts.max}` });
    return null;
  }
  return value;
}

export function expectArray(value, path, errors, opts = {}) {
  if (!Array.isArray(value)) {
    errors.push({ path, message: "expected array" });
    return null;
  }
  if (opts.minItems != null && value.length < opts.minItems) {
    errors.push({ path, message: `expected at least ${opts.minItems} item(s)` });
    return null;
  }
  return value;
}

export function expectVec4(value, path, errors) {
  if (!Array.isArray(value) || value.length !== 4) {
    errors.push({ path, message: "expected [x,y,z,w] length-4 array" });
    return null;
  }
  for (let i = 0; i < 4; i++) {
    expectFiniteNumber(value[i], joinPath(path, i), errors);
  }
  return value;
}

export function expectEnumMember(value, path, allowed, errors) {
  if (!(allowed).includes(value)) {
    errors.push({
      path,
      message: `expected one of ${allowed.join(", ")}`,
    });
    return null;
  }
  return value;
}

export function expectHexColor(value, path, errors) {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    errors.push({ path, message: "expected #RRGGBB hex color" });
    return null;
  }
  return value;
}

export function expectBoolean(value, path, errors) {
  if (typeof value !== "boolean") {
    errors.push({ path, message: "expected boolean" });
    return null;
  }
  return value;
}

export function expectRecordOfNumbers(value, path, errors) {
  const obj = expectObject(value, path, errors);
  if (obj === null) return null;
  for (const [k, v] of Object.entries(obj)) {
    expectFiniteNumber(v, joinPath(path, k), errors);
  }
  return obj;
}

export function expectStringArray(value, path, errors) {
  const arr = expectArray(value, path, errors);
  if (arr === null) return null;
  for (let i = 0; i < arr.length; i++) {
    expectString(arr[i], joinPath(path, i), errors);
  }
  return arr;
}
