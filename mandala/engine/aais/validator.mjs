/**
 * Tiny JSON Schema subset validator (type / required / const / enum / properties / items / allOf / if-then).
 * Used by the AAIS gate. Not a full draft-2020 implementation.
 */

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function checkType(schema, data, path, errors) {
  if (!schema.type) return;
  const t = schema.type;
  const ok =
    (t === "object" && isObject(data)) ||
    (t === "array" && Array.isArray(data)) ||
    (t === "string" && typeof data === "string") ||
    (t === "number" && typeof data === "number" && Number.isFinite(data)) ||
    (t === "boolean" && typeof data === "boolean");
  if (!ok) errors.push(`${path}: expected ${t}`);
}

export function validate(schema, data, path = "$") {
  const errors = [];
  if (schema == null) return errors;
  checkType(schema, data, path, errors);
  if (Object.prototype.hasOwnProperty.call(schema, "const") && data !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${path}: expected one of ${schema.enum.join("|")}`);
  }
  if (schema.type === "string" && typeof data === "string") {
    if (schema.minLength != null && data.length < schema.minLength) {
      errors.push(`${path}: string shorter than ${schema.minLength}`);
    }
  }
  if (schema.type === "array" && Array.isArray(data)) {
    if (schema.minItems != null && data.length < schema.minItems) {
      errors.push(`${path}: array shorter than ${schema.minItems}`);
    }
    if (schema.maxItems != null && data.length > schema.maxItems) {
      errors.push(`${path}: array longer than ${schema.maxItems}`);
    }
    if (schema.items) {
      data.forEach((item, i) => errors.push(...validate(schema.items, item, `${path}[${i}]`)));
    }
  }
  if (isObject(data) && (schema.type === "object" || schema.properties || schema.required)) {
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        errors.push(`${path}: missing required "${key}"`);
      }
    }
    const props = schema.properties || {};
    for (const [key, sub] of Object.entries(props)) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        errors.push(...validate(sub, data[key], `${path}.${key}`));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(data)) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) {
          errors.push(`${path}: additional property "${key}" not allowed`);
        }
      }
    }
  }
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) errors.push(...validate(sub, data, path));
  }
  if (schema.if) {
    const ifErrors = validate(schema.if, data, path);
    if (ifErrors.length === 0 && schema.then) {
      errors.push(...validate(schema.then, data, path));
    } else if (ifErrors.length > 0 && schema.else) {
      errors.push(...validate(schema.else, data, path));
    }
  }
  return errors;
}

export function assertValid(schema, data, label = "document") {
  const errors = validate(schema, data);
  if (errors.length) {
    const err = new Error(`${label} failed schema: ${errors.slice(0, 8).join("; ")}`);
    err.errors = errors;
    throw err;
  }
  return true;
}
