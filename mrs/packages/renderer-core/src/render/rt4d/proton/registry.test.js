/**
 * ProtonRegistry + mapper acceptance tests.
 *
 * STATUS: **enforced**
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProtonRegistry } from "./registry.js";
import { fromHyperspheres } from "./fromHyperspheres.js";
import { fromWorldDocumentRt4d } from "./fromWorldDocumentRt4d.js";
import { fromSceneSpec } from "./fromSceneSpec.js";
import { CIR_OVERLAY_FIELDS, MAX_PROTONS, resolveMu } from "./types.js";
import { mintCir } from "../../../../../../adapters/proton-raster-bridge/mintCir.js";

describe("proton registry", () => {
  it("add + list round-trip; list sorted by id", () => {
    const reg = new ProtonRegistry();
    reg.add({ id: "z", mu: [0, 0, 0, 0], radius: 1 });
    reg.add({ id: "a", mu: [1, 0, 0, 0], radius: 0.5 });
    assert.equal(reg.size, 2);
    const ids = reg.list().map((p) => p.id);
    assert.deepEqual(ids, ["a", "z"]);
  });

  it("registry hash is stable for same protons", () => {
    const make = () => {
      const reg = new ProtonRegistry();
      reg.add({ id: "p1", mu: [0, 0.1, 0, 0], radius: 1, color: [1, 0, 0] });
      reg.add({ id: "p0", center: [1, 0, 0, 0], radius: 0.5, opacity: 0.8 });
      return reg.hash();
    };
    assert.equal(make(), make());
    assert.equal(make().length, 64);
  });

  it("respects maxProtons cap", () => {
    const reg = new ProtonRegistry({ maxProtons: 2 });
    reg.add({ id: "1", mu: [0, 0, 0, 0], radius: 1 });
    reg.add({ id: "2", mu: [1, 0, 0, 0], radius: 1 });
    assert.throws(() => reg.add({ id: "3", mu: [2, 0, 0, 0], radius: 1 }), /maxProtons/);
    assert.equal(MAX_PROTONS, 128);
  });

  it("fromHyperspheres maps mu/center aliases", () => {
    const protons = fromHyperspheres([
      { id: "m", mu: [1, 2, 3, 4], radius: 0.9 },
      { id: "c", center: [5, 6, 7, 8], radius: 0.4 },
    ]);
    assert.equal(protons.length, 2);
    assert.deepEqual(resolveMu(protons[0]), [1, 2, 3, 4]);
    assert.deepEqual(resolveMu(protons[1]), [5, 6, 7, 8]);
  });

  it("fromWorldDocumentRt4d hyperspheres + capsule samples", () => {
    const protons = fromWorldDocumentRt4d({
      id: "world-1",
      primitives: [
        { kind: "hypersphere", id: "h0", center: [0, 0, 0, 0], radius: 1 },
        {
          kind: "oriented-capsule",
          id: "cap",
          a: [0, 0, 0, 0],
          b: [1, 0, 0, 0],
          radius: 0.2,
        },
      ],
    });
    // 1 hypersphere + 3 capsule samples
    assert.equal(protons.length, 4);
    assert.ok(protons.every((p) => p.meta?.worldId === "world-1"));
  });

  it("fromSceneSpec simple spheres produces ≥1 proton", () => {
    const protons = fromSceneSpec({
      spheres: [{ mu: [0, 0, 0, 0], radius: 1, color: [1, 1, 1] }],
    });
    assert.ok(protons.length >= 1);
  });

  it("CIR overlay fields id/actor/timestamp/purpose without parallel governance", () => {
    const cir = mintCir({ seed: 42, goal: "test-cir", actor: "tester" });
    assert.deepEqual([...CIR_OVERLAY_FIELDS].sort(), [
      "actor",
      "id",
      "purpose",
      "timestamp",
    ].sort());
    for (const f of CIR_OVERLAY_FIELDS) {
      assert.ok(cir[f] != null && String(cir[f]).length > 0);
    }
    const cir2 = mintCir({ seed: 42, goal: "test-cir", actor: "tester" });
    assert.equal(cir.id, cir2.id);
  });
});
