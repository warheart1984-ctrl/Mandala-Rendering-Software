import { createHash } from "node:crypto";

function isTypedArray(value: unknown): value is Exclude<ArrayBufferView, DataView> {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

/** Reject non-finite numbers anywhere in a value before geometry or hashing. */
export function assertFiniteDeep(value: unknown, path = "$"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`non-finite number at ${path}`);
    return;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (Array.isArray(value) || isTypedArray(value)) {
    Array.from(value as unknown as ArrayLike<unknown>).forEach((entry, index) =>
      assertFiniteDeep(entry, `${path}[${index}]`),
    );
    return;
  }
  if (typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      assertFiniteDeep((value as Record<string, unknown>)[key], `${path}.${key}`);
    }
  }
}

function encodeCanonical(value: unknown, active: WeakSet<object>, path: string): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`non-finite number at ${path}`);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value === "undefined") throw new Error(`undefined is not canonical at ${path}`);
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    throw new Error(`unsupported canonical value at ${path}`);
  }

  if (isTypedArray(value)) {
    return encodeCanonical(Array.from(value as unknown as ArrayLike<unknown>), active, path);
  }
  if (value instanceof DataView || value instanceof ArrayBuffer) {
    throw new Error(`raw buffers are not canonical objects at ${path}`);
  }
  if (Array.isArray(value)) {
    if (active.has(value)) throw new Error(`cyclic value at ${path}`);
    active.add(value);
    const result = `[${value
      .map((entry, index) => encodeCanonical(entry, active, `${path}[${index}]`))
      .join(",")}]`;
    active.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (active.has(value)) throw new Error(`cyclic value at ${path}`);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`non-plain object is not canonical at ${path}`);
    }
    active.add(value);
    const record = value as Record<string, unknown>;
    const result = `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${encodeCanonical(record[key], active, `${path}.${key}`)}`,
      )
      .join(",")}}`;
    active.delete(value);
    return result;
  }
  throw new Error(`unsupported canonical value at ${path}`);
}

/** Stable JSON: sorted object keys, preserved array order, normalized -0, finite numbers only. */
export function canonicalJson(value: unknown): string {
  return encodeCanonical(value, new WeakSet<object>(), "$");
}

/** Hash raw strings/bytes directly; other values are first encoded as canonical JSON. */
export function sha256Hex(value: unknown): string {
  const bytes =
    typeof value === "string" || value instanceof Uint8Array
      ? value
      : canonicalJson(value);
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
