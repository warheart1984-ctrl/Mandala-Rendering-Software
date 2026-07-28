/**
 * scene-spec unit tests — parse / validate / convert / timeline.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseSceneSpecification,
  validateSceneCapabilities,
  convertSceneSpecification,
  hashSceneSpecification,
  sampleTimeline,
  sampleFrame,
  expandSurfaceToSpheres,
  tesseractEdges,
} from "./index.js";

const TESSERACT_SPEC = {
  schemaVersion: "1.0",
  kind: "SceneSpecification",
  id: "hackathon-tesseract-spin",
  name: "Rotating tesseract",
  materials: [{ id: "neon", color: "#1accff", opacity: 1, wireframe: false }],
  entities: [
    {
      id: "tess",
      materialId: "neon",
      transform4d: { rotate: { xw: 0, zw: 0 } },
      geometry: { kind: "surface", surfaceId: "tesseract" },
    },
  ],
  defaultObservation: { modeId: "perspective_w", params: { d4: 4 } },
  camera: {
    position4d: [4.3, 1.4, 0.2, 0.1],
    target4d: [0, 0.1, 0, 0],
    fovX: 52,
    fovY: 52,
  },
  lights: [
    {
      id: "key",
      center: [2.4, 3.3, -1.6, 0.7],
      radius: 0.95,
      emission: [17, 16, 14.5],
    },
  ],
  output: { width: 64, height: 48, samples: 2, maxDepth: 3, seed: 42 },
  animation: {
    duration: 1,
    fps: 4,
    keyframes: [
      {
        time: 0,
        entities: { tess: { transform4d: { rotate: { xw: 0 } } } },
      },
      {
        time: 1,
        entities: { tess: { transform4d: { rotate: { xw: Math.PI } } } },
      },
    ],
  },
};

describe("parseSceneSpecification", () => {
  it("accepts a valid tesseract scene spec", () => {
    const r = parseSceneSpecification(TESSERACT_SPEC);
    assert.equal(r.ok, true);
    assert.equal(r.value.id, "hackathon-tesseract-spin");
  });

  it("rejects missing entities with field path", () => {
    const r = parseSceneSpecification({
      schemaVersion: "1.0",
      id: "bad",
      entities: [],
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.path === "entities"));
  });

  it("rejects bad rotate key with path", () => {
    const r = parseSceneSpecification({
      schemaVersion: "1.0",
      id: "bad-rot",
      entities: [
        {
          id: "e",
          geometry: { kind: "hypersphere", radius: 1 },
          transform4d: { rotate: { ab: 1 } },
        },
      ],
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.path.includes("rotate.ab")));
  });

  it("rejects invalid hex color path", () => {
    const r = parseSceneSpecification({
      schemaVersion: "1.0",
      id: "bad-color",
      materials: [{ id: "m", color: "cyan" }],
      entities: [{ id: "e", geometry: { kind: "empty" } }],
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.path === "materials[0].color"));
  });
});

describe("validateSceneCapabilities", () => {
  it("accepts supported RT4D surface", () => {
    const r = validateSceneCapabilities(TESSERACT_SPEC, { target: "rt4d" });
    assert.equal(r.ok, true);
  });

  it("rejects meshRef for RT4D with path", () => {
    const r = validateSceneCapabilities(
      {
        schemaVersion: "1.0",
        id: "mesh",
        entities: [
          {
            id: "m",
            geometry: { kind: "meshRef", uri: "file://x" },
          },
        ],
      },
      { target: "rt4d" },
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.path.includes("geometry.kind")));
  });

  it("rejects unknown observation mode", () => {
    const r = validateSceneCapabilities({
      schemaVersion: "1.0",
      id: "obs",
      entities: [{ id: "e", geometry: { kind: "hypersphere", radius: 1 } }],
      defaultObservation: { modeId: "full_4d_magic" },
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.path === "defaultObservation.modeId"));
  });
});

describe("convertSceneSpecification", () => {
  it("is deterministic for the same spec", () => {
    const a = convertSceneSpecification(TESSERACT_SPEC);
    const b = convertSceneSpecification(TESSERACT_SPEC);
    assert.equal(a.specHash, b.specHash);
    assert.equal(a.seed, 42);
    assert.deepEqual(a.rt4d.primitives, b.rt4d.primitives);
    // tesseract expands to lattice family (vertices + beams + core + rings),
    // not the legacy bare 16-vertex set.
    assert.ok(a.rt4d.primitives.length > 100);
    assert.equal(a.worldDocument.schemaVersion, "1.0");
    assert.equal(a.worldDocument.entities[0].geometry.kind, "surface");
  });

  it("tesseract expand includes core and edge beams", () => {
    const spheres = expandSurfaceToSpheres("tesseract");
    assert.ok(spheres.length > 100);
    // Largest radius should be the energy core (~0.42).
    const maxR = Math.max(...spheres.map((s) => s.radius));
    assert.ok(maxR >= 0.4);
    assert.equal(tesseractEdges().length, 32);
  });

  it("preserves ggx materialType from SceneSpec brdf", () => {
    const spec = {
      schemaVersion: "1.0",
      kind: "SceneSpecification",
      id: "ggx-convert",
      materials: [
        { id: "chrome", color: "#cccccc", brdf: "ggx", roughness: 0.2, f0: 0.8 },
      ],
      entities: [
        {
          id: "ball",
          materialId: "chrome",
          geometry: { kind: "hypersphere", center: [0, 0, 0, 0], radius: 0.5 },
        },
      ],
      output: { width: 8, height: 8, samples: 1, seed: 1 },
    };
    const { rt4d } = convertSceneSpecification(spec);
    assert.equal(rt4d.primitives[0].materialType, "ggx");
    assert.equal(rt4d.primitives[0].roughness, 0.2);
  });
});

describe("sampleTimeline", () => {
  it("produces expected frame count for 1s @ 4fps", () => {
    const { frames, frameCount } = sampleTimeline(TESSERACT_SPEC);
    // duration*fps + 1 end frame = 5
    assert.equal(frameCount, 5);
    assert.equal(frames.length, 5);
  });

  it("interpolates xw rotation at midpoint", () => {
    const mid = sampleFrame(TESSERACT_SPEC, { time: 0.5 });
    const rot = mid.spec.entities.find((e) => e.id === "tess").transform4d.rotate;
    assert.ok(Math.abs(rot.xw - Math.PI / 2) < 1e-9);
  });

  it("rotating tesseract over N frames yields distinct transforms", () => {
    const { frames } = sampleTimeline(TESSERACT_SPEC);
    const angles = frames.map(
      (f) => f.spec.entities.find((e) => e.id === "tess").transform4d.rotate.xw,
    );
    assert.equal(angles[0], 0);
    assert.ok(Math.abs(angles[angles.length - 1] - Math.PI) < 1e-9);
    assert.ok(angles[2] > angles[1]);
  });
});
