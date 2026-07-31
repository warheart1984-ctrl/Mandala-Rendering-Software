/**
 * SceneSpecification parse — JSON / object → validated internal representation.
 *
 * Overlaps WorldDocument v1 (@mrs/scene-schema). Uses a thin JS validator so
 * renderer-core does not require a prior `tsc` of scene-schema (documented in
 * SCENE_SPEC_RFC.md). Callers with dist/ available may also run
 * validateWorldDocument independently.
 */

import {
  expectArray,
  expectBoolean,
  expectEnumMember,
  expectFiniteNumber,
  expectHexColor,
  expectObject,
  expectRecordOfNumbers,
  expectString,
  expectStringArray,
  expectVec4,
  fail,
  isPlainObject,
  joinPath,
  ok,
} from "./helpers.js";

const SCHEMA_VERSIONS = ["1.0"];
const GEOMETRY_KINDS = [
  "surface",
  "meshRef",
  "sdfRef",
  "empty",
  "hypersphere",
  "hyperplane",
];
const ROTATE_KEYS = ["xy", "xz", "xw", "yz", "yw", "zw"];

function validateRotate4D(value, path, errors) {
  const obj = expectObject(value, path, errors);
  if (obj === null) return;
  for (const [k, v] of Object.entries(obj)) {
    if (!ROTATE_KEYS.includes(k)) {
      errors.push({
        path: joinPath(path, k),
        message: `unknown rotate key (expected one of ${ROTATE_KEYS.join(", ")})`,
      });
      continue;
    }
    expectFiniteNumber(v, joinPath(path, k), errors);
  }
}

function validateTransform4D(value, path, errors) {
  const obj = expectObject(value, path, errors);
  if (obj === null) return;
  if (obj.translate !== undefined) {
    expectVec4(obj.translate, joinPath(path, "translate"), errors);
  }
  if (obj.rotate !== undefined) {
    validateRotate4D(obj.rotate, joinPath(path, "rotate"), errors);
  }
  if (obj.scale !== undefined) {
    expectVec4(obj.scale, joinPath(path, "scale"), errors);
  }
}

function validateGeometry(value, path, errors) {
  const obj = expectObject(value, path, errors);
  if (obj === null) return;
  expectEnumMember(obj.kind, joinPath(path, "kind"), GEOMETRY_KINDS, errors);

  if (obj.kind === "surface") {
    expectString(obj.surfaceId, joinPath(path, "surfaceId"), errors, {
      nonEmpty: true,
    });
  }
  if (obj.kind === "hypersphere") {
    if (obj.center !== undefined) {
      expectVec4(obj.center, joinPath(path, "center"), errors);
    }
    expectFiniteNumber(obj.radius ?? 0.5, joinPath(path, "radius"), errors, {
      min: 1e-6,
    });
    if (obj.radius === undefined) {
      // radius optional with default — only error if present & invalid (above)
    }
  }
  if (obj.kind === "hyperplane") {
    if (obj.normal !== undefined) {
      expectVec4(obj.normal, joinPath(path, "normal"), errors);
    }
    if (obj.offset !== undefined) {
      expectFiniteNumber(obj.offset, joinPath(path, "offset"), errors);
    }
  }
  if (obj.surfaceId !== undefined && obj.kind !== "surface") {
    expectString(obj.surfaceId, joinPath(path, "surfaceId"), errors, {
      nonEmpty: true,
    });
  }
  if (obj.uri !== undefined) {
    expectString(obj.uri, joinPath(path, "uri"), errors);
  }
  if (obj.resolution !== undefined) {
    expectFiniteNumber(obj.resolution, joinPath(path, "resolution"), errors, {
      integer: true,
      min: 1,
    });
  }
  if (obj.radius !== undefined && obj.kind !== "hypersphere") {
    expectFiniteNumber(obj.radius, joinPath(path, "radius"), errors, { min: 1e-6 });
  }
}

function validateMaterial(value, path, errors) {
  const obj = expectObject(value, path, errors);
  if (obj === null) return;
  expectString(obj.id, joinPath(path, "id"), errors, { nonEmpty: true });
  if (obj.color !== undefined) {
    expectHexColor(obj.color, joinPath(path, "color"), errors);
  }
  if (obj.opacity !== undefined) {
    expectFiniteNumber(obj.opacity, joinPath(path, "opacity"), errors, {
      min: 0,
      max: 1,
    });
  }
  if (obj.wireframe !== undefined) {
    expectBoolean(obj.wireframe, joinPath(path, "wireframe"), errors);
  }
  if (obj.brdf !== undefined) {
    expectEnumMember(
      String(obj.brdf).toLowerCase(),
      joinPath(path, "brdf"),
      ["lambertian", "ggx"],
      errors,
    );
  }
  if (obj.type !== undefined && obj.brdf === undefined) {
    expectEnumMember(
      String(obj.type).toLowerCase(),
      joinPath(path, "type"),
      ["lambertian", "ggx"],
      errors,
    );
  }
  if (obj.roughness !== undefined) {
    expectFiniteNumber(obj.roughness, joinPath(path, "roughness"), errors, {
      min: 0.01,
      max: 1,
    });
  }
  if (obj.f0 !== undefined) {
    expectFiniteNumber(obj.f0, joinPath(path, "f0"), errors, {
      min: 0,
      max: 1,
    });
  }
}

function validateEntity(value, path, errors) {
  const obj = expectObject(value, path, errors);
  if (obj === null) return;
  expectString(obj.id, joinPath(path, "id"), errors, { nonEmpty: true });
  if (obj.name !== undefined) {
    expectString(obj.name, joinPath(path, "name"), errors);
  }
  if (obj.transform4d !== undefined) {
    validateTransform4D(obj.transform4d, joinPath(path, "transform4d"), errors);
  }
  validateGeometry(obj.geometry, joinPath(path, "geometry"), errors);
  if (obj.materialId !== undefined) {
    expectString(obj.materialId, joinPath(path, "materialId"), errors);
  }
  if (obj.tags !== undefined) {
    expectStringArray(obj.tags, joinPath(path, "tags"), errors);
  }
  if (obj.userData !== undefined && !isPlainObject(obj.userData)) {
    errors.push({ path: joinPath(path, "userData"), message: "expected object" });
  }
}

function validateObservation(value, path, errors) {
  const obj = expectObject(value, path, errors);
  if (obj === null) return;
  expectString(obj.modeId, joinPath(path, "modeId"), errors, { nonEmpty: true });
  if (obj.params !== undefined) {
    expectRecordOfNumbers(obj.params, joinPath(path, "params"), errors);
  }
}

function validateCamera(value, path, errors) {
  const obj = expectObject(value, path, errors);
  if (obj === null) return;
  if (obj.position4d !== undefined) {
    expectVec4(obj.position4d, joinPath(path, "position4d"), errors);
  }
  if (obj.target4d !== undefined) {
    expectVec4(obj.target4d, joinPath(path, "target4d"), errors);
  }
  for (const k of ["fovX", "fovY", "fovZ", "fovW"]) {
    if (obj[k] !== undefined) {
      expectFiniteNumber(obj[k], joinPath(path, k), errors, { min: 1, max: 179 });
    }
  }
}

function validateLight(value, path, errors) {
  const obj = expectObject(value, path, errors);
  if (obj === null) return;
  expectString(obj.id, joinPath(path, "id"), errors, { nonEmpty: true });
  expectVec4(obj.center, joinPath(path, "center"), errors);
  expectFiniteNumber(obj.radius, joinPath(path, "radius"), errors, { min: 1e-6 });
  if (obj.emission !== undefined) {
    if (!Array.isArray(obj.emission) || obj.emission.length < 3) {
      errors.push({
        path: joinPath(path, "emission"),
        message: "expected [r,g,b] or [r,g,b,a] array",
      });
    } else {
      for (let i = 0; i < obj.emission.length; i++) {
        expectFiniteNumber(obj.emission[i], joinPath(path, "emission") + `[${i}]`, errors);
      }
    }
  }
}

function validateOutput(value, path, errors) {
  const obj = expectObject(value, path, errors);
  if (obj === null) return;
  for (const [k, min, max] of [
    ["width", 16, 1024],
    ["height", 16, 1024],
    ["samples", 1, 512],
    ["maxDepth", 1, 12],
  ]) {
    if (obj[k] !== undefined) {
      expectFiniteNumber(obj[k], joinPath(path, k), errors, {
        integer: true,
        min,
        max,
      });
    }
  }
  if (obj.seed !== undefined) {
    expectFiniteNumber(obj.seed, joinPath(path, "seed"), errors, {
      integer: true,
      min: 0,
    });
  }
  if (obj.exposure !== undefined) {
    expectFiniteNumber(obj.exposure, joinPath(path, "exposure"), errors, {
      min: 1e-6,
    });
  }
}

function validateKeyframe(value, path, errors) {
  const obj = expectObject(value, path, errors);
  if (obj === null) return;
  expectFiniteNumber(obj.time, joinPath(path, "time"), errors, { min: 0 });
  if (obj.camera !== undefined) {
    validateCamera(obj.camera, joinPath(path, "camera"), errors);
  }
  if (obj.entities !== undefined) {
    const ent = expectObject(obj.entities, joinPath(path, "entities"), errors);
    if (ent) {
      for (const [id, patch] of Object.entries(ent)) {
        const p = expectObject(patch, joinPath(path, "entities") + `.${id}`, errors);
        if (p && p.transform4d !== undefined) {
          validateTransform4D(
            p.transform4d,
            joinPath(path, "entities") + `.${id}.transform4d`,
            errors,
          );
        }
      }
    }
  }
}

function validateAnimation(value, path, errors) {
  const obj = expectObject(value, path, errors);
  if (obj === null) return;
  expectFiniteNumber(obj.duration, joinPath(path, "duration"), errors, { min: 0 });
  expectFiniteNumber(obj.fps, joinPath(path, "fps"), errors, {
    min: 1,
    max: 120,
  });
  const kfs = expectArray(obj.keyframes, joinPath(path, "keyframes"), errors, {
    minItems: 1,
  });
  if (kfs) {
    for (let i = 0; i < kfs.length; i++) {
      validateKeyframe(kfs[i], joinPath(path, "keyframes") + `[${i}]`, errors);
    }
  }
}

/**
 * Validate optional shot metadata — sequence/episode/shot identifiers + frame range.
 * Used for versioned SceneSpecs and shot/sequence management (render track).
 */
function validateShot(value, path, errors) {
  const obj = expectObject(value, path, errors);
  if (obj === null) return;
  if (obj.sequenceId !== undefined) expectString(obj.sequenceId, joinPath(path, "sequenceId"), errors);
  if (obj.episodeId !== undefined) expectString(obj.episodeId, joinPath(path, "episodeId"), errors);
  if (obj.shotId !== undefined) expectString(obj.shotId, joinPath(path, "shotId"), errors);
  if (obj.take !== undefined) {
    expectFiniteNumber(obj.take, joinPath(path, "take"), errors);
    if (Number.isFinite(obj.take) && obj.take < 0) {
      errors.push({ path: joinPath(path, "take"), message: "take must be >= 0" });
    }
  }
  if (obj.frameStart !== undefined) {
    expectFiniteNumber(obj.frameStart, joinPath(path, "frameStart"), errors);
  }
  if (obj.frameEnd !== undefined) {
    expectFiniteNumber(obj.frameEnd, joinPath(path, "frameEnd"), errors);
  }
  if (Number.isFinite(obj.frameStart) && Number.isFinite(obj.frameEnd) && obj.frameStart > obj.frameEnd) {
    errors.push({ path, message: "frameStart must be <= frameEnd" });
  }
  if (obj.sceneVersion !== undefined) expectString(obj.sceneVersion, joinPath(path, "sceneVersion"), errors);
  if (obj.shotVersion !== undefined) expectString(obj.shotVersion, joinPath(path, "shotVersion"), errors);
}

/**
 * Structural parse/validate of a SceneSpecification (WorldDocument + extensions).
 * @param {unknown} value
 * @returns {ValidationResult}
 */
export function parseSceneSpecification(value) {
  const errors = [];
  const obj = expectObject(value, "", errors);
  if (obj === null) return fail(errors);

  expectEnumMember(obj.schemaVersion, "schemaVersion", SCHEMA_VERSIONS, errors);
  expectString(obj.id, "id", errors, { nonEmpty: true });

  if (obj.kind !== undefined) {
    expectEnumMember(obj.kind, "kind", ["SceneSpecification"], errors);
  }
  if (obj.name !== undefined) expectString(obj.name, "name", errors);
  if (obj.description !== undefined) {
    expectString(obj.description, "description", errors);
  }
  if (obj.units !== undefined) expectString(obj.units, "units", errors);

  if (obj.materials !== undefined) {
    const materials = expectArray(obj.materials, "materials", errors);
    if (materials) {
      for (let i = 0; i < materials.length; i++) {
        validateMaterial(materials[i], joinPath("materials", i), errors);
      }
    }
  }

  const entities = expectArray(obj.entities, "entities", errors, { minItems: 1 });
  if (entities) {
    for (let i = 0; i < entities.length; i++) {
      validateEntity(entities[i], joinPath("entities", i), errors);
    }
  }

  if (obj.defaultObservation !== undefined) {
    validateObservation(obj.defaultObservation, "defaultObservation", errors);
  }
  if (obj.camera !== undefined) {
    validateCamera(obj.camera, "camera", errors);
  }
  if (obj.lights !== undefined) {
    const lights = expectArray(obj.lights, "lights", errors);
    if (lights) {
      for (let i = 0; i < lights.length; i++) {
        validateLight(lights[i], joinPath("lights", i), errors);
      }
    }
  }
  if (obj.output !== undefined) {
    validateOutput(obj.output, "output", errors);
  }
  if (obj.animation !== undefined) {
    validateAnimation(obj.animation, "animation", errors);
  }
  if (obj.metadata !== undefined && !isPlainObject(obj.metadata)) {
    errors.push({ path: "metadata", message: "expected object" });
  }

  if (obj.shot !== undefined) {
    validateShot(obj.shot, "shot", errors);
  }

  if (errors.length > 0) return fail(errors);
  return ok(/** @type {object} */ (value));
}

/**
 * Parse JSON text into a SceneSpecification.
 * @param {string} text
 * @returns {ValidationResult}
 */
export function parseSceneSpecificationJson(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (err) {
    return fail([
      {
        path: "",
        message: `invalid JSON: ${err && err.message ? err.message : String(err)}`,
      },
    ]);
  }
  return parseSceneSpecification(value);
}
