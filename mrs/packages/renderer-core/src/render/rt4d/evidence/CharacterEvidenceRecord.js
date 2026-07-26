import { createHash } from "node:crypto";

function sortKeys(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && Object.is(value, -0)) return 0;
    return value;
  }
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(sortKeys);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
  return out;
}

export function canonicalRt4dJson(value) {
  return JSON.stringify(sortKeys(value));
}

export function sha256Hex(value) {
  const hash = createHash("sha256");
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) hash.update(value);
  else hash.update(canonicalRt4dJson(value));
  return hash.digest("hex");
}

export class CharacterEvidenceBuilder {
  build(frameIndex, seed, rigId, poseId, camera, lighting, bones, vertices, materials, pngBytes) {
    return {
      frameIndex: frameIndex | 0,
      seed: seed >>> 0,
      rigId: String(rigId),
      poseId: String(poseId),
      cameraHash: this.hashCamera(camera),
      lightingRigHash: this.hashLighting(lighting),
      boneHash: this.hashBones(bones),
      meshDeformationHash: this.hashVertices(vertices),
      materialHash: this.hashMaterials(materials),
      pngChecksum: this.hashPng(pngBytes),
    };
  }

  hashCamera(camera) {
    return sha256Hex(camera);
  }

  hashLighting(lighting) {
    return sha256Hex(lighting);
  }

  hashBones(bones) {
    return sha256Hex(bones);
  }

  hashVertices(vertices) {
    return sha256Hex(vertices);
  }

  hashMaterials(materials) {
    return sha256Hex(materials);
  }

  hashPng(pngBytes) {
    return sha256Hex(pngBytes ?? new Uint8Array());
  }
}

export class UniversalEvidenceBuilder {
  build({ frameIndex, seed, world, materials, camera, lighting, rig = null, physics = null, particles = null, environment = null, timeline = null, pngBytes }) {
    const record = {
      frameIndex: frameIndex | 0,
      seed: seed >>> 0,
      worldHash: sha256Hex(world ?? {}),
      materialHash: sha256Hex(materials ?? []),
      cameraHash: sha256Hex(camera ?? {}),
      lightingHash: sha256Hex(lighting ?? {}),
      pngChecksum: sha256Hex(pngBytes ?? new Uint8Array()),
    };
    if (rig) record.rigHash = sha256Hex(rig);
    if (physics) record.physicsHash = sha256Hex(physics);
    if (particles) record.particleHash = sha256Hex(particles);
    if (environment) record.environmentHash = sha256Hex(environment);
    if (timeline) record.timelineHash = sha256Hex(timeline);
    return record;
  }
}
