const DEFAULT_SAMPLER = Object.freeze({
  wrapS: "repeat",
  wrapT: "repeat",
  minFilter: "linear",
  magFilter: "linear",
});

function wrap01(value) {
  const v = value - Math.floor(value);
  return v < 0 ? v + 1 : v;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function checksumSeed(checksum) {
  let h = 2166136261 >>> 0;
  for (const ch of String(checksum ?? "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function proceduralTexel(entry, x, y) {
  const seed = checksumSeed(entry.checksum);
  const r = ((seed & 0xff) / 255) || 0.5;
  const g = (((seed >>> 8) & 0xff) / 255) || 0.5;
  const b = (((seed >>> 16) & 0xff) / 255) || 0.5;
  const checker = ((x + y + (seed & 1)) & 1) === 0 ? 1 : 0.65;
  return [r * checker, g * checker, b * checker, 1];
}

function pixelAt(entry, x, y) {
  const data = entry.data ?? entry.pixels;
  const width = entry.width;
  const height = entry.height;
  if (!data || !width || !height) return proceduralTexel(entry, x, y);
  const idx = (y * width + x) * 4;
  const max = data instanceof Uint8Array || data instanceof Uint8ClampedArray ? 255 : 1;
  return [
    clamp01((data[idx] ?? 0) / max),
    clamp01((data[idx + 1] ?? 0) / max),
    clamp01((data[idx + 2] ?? 0) / max),
    clamp01((data[idx + 3] ?? max) / max),
  ];
}

export function normalizeTextureEntry(entry) {
  if (!entry?.id) throw new Error("TextureRegistry.register requires entry.id");
  return {
    id: String(entry.id),
    ...(entry.role ? { role: String(entry.role) } : {}),
    ...(entry.uri ? { uri: String(entry.uri) } : {}),
    width: Number.isInteger(entry.width) && entry.width > 0 ? entry.width : 1,
    height: Number.isInteger(entry.height) && entry.height > 0 ? entry.height : 1,
    format: entry.format ?? "rgba8",
    colorSpace: entry.colorSpace ?? "srgb",
    checksum: String(entry.checksum ?? entry.id),
    ...(entry.data ? { data: entry.data } : {}),
    ...(entry.pixels ? { pixels: entry.pixels } : {}),
    sampler: {
      ...DEFAULT_SAMPLER,
      ...(entry.sampler ?? {}),
    },
  };
}

export class TextureRegistry {
  constructor(entries = []) {
    this.table = new Map();
    for (const entry of entries) this.register(entry);
  }

  register(entry) {
    const normalized = normalizeTextureEntry(entry);
    this.table.set(normalized.id, normalized);
    return normalized;
  }

  get(id) {
    return this.table.get(id);
  }

  has(id) {
    return this.table.has(id);
  }

  entries() {
    return Array.from(this.table.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  resolveMaterialTextures(materialEntry) {
    const refs = materialEntry?.params?.textureRefs;
    if (!Array.isArray(refs)) return [];
    return refs.map((ref) => ({
      role: ref.role,
      texture: this.get(ref.id),
    })).filter((binding) => binding.texture);
  }

  sample(id, uv = [0, 0]) {
    const entry = this.get(id);
    if (!entry) return null;
    const u = entry.sampler.wrapS === "clamp-to-edge" ? clamp01(uv[0] ?? 0) : wrap01(uv[0] ?? 0);
    const v = entry.sampler.wrapT === "clamp-to-edge" ? clamp01(uv[1] ?? 0) : wrap01(uv[1] ?? 0);
    const x = Math.min(entry.width - 1, Math.max(0, Math.floor(u * entry.width)));
    const y = Math.min(entry.height - 1, Math.max(0, Math.floor(v * entry.height)));
    return pixelAt(entry, x, y);
  }
}
