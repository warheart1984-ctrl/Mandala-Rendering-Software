import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const schemasDir = join(root, "schemas");

function validate(obj, schema) {
  const errors = [];
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in obj)) errors.push(`missing required: ${field}`);
    }
  }
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in obj && propSchema.type) {
        const val = obj[key];
        if (propSchema.type === "string" && typeof val !== "string") errors.push(`${key} should be string`);
        if (propSchema.type === "number" && typeof val !== "number") errors.push(`${key} should be number`);
        if (propSchema.type === "boolean" && typeof val !== "boolean") errors.push(`${key} should be boolean`);
        if (propSchema.type === "object" && (typeof val !== "object" || val === null)) errors.push(`${key} should be object`);
        if (propSchema.type === "integer" && (typeof val !== "number" || !Number.isInteger(val))) errors.push(`${key} should be integer`);
        if (propSchema.type === "array" && !Array.isArray(val)) errors.push(`${key} should be array`);
      }
    }
  }
  return errors;
}

const schemas = [
  { file: "IntentRecord.schema.json", good: { id: "i1", actor: "4dce.renderer", type: "play_timeline", timestamp: new Date().toISOString() } },
  { file: "EvidenceRecord.schema.json", good: { timestamp: new Date().toISOString(), id: "ev1", source: "renderer", vertexCount: 16, edgeCount: 32, theta: 0, d4: 5, d3: 5, speed: 1, scale: 1 } },
  { file: "GovernanceDecision.schema.json", good: { ok: true, verdict: "allow", reason: "Policies satisfied", attachProvenance: false } },
  { file: "CSR.schema.json", good: { id: "csr-1", intentId: "i1", action: "render.session.start", contractId: "contract.cinematic4d.v1", charterId: "charter.4dce.v1", evidence: { timestamp: "now" }, result: {}, createdAt: new Date().toISOString() } },
  { file: "ProvenanceFrame.schema.json", good: { intentId: "i1", timelineId: "t1", worldId: "w1", timeSeconds: 0, parameters: {} } },
  { file: "Timeline.schema.json", good: { id: "tl1", name: "test", tracks: [{ binding: "renderer", clips: [] }] } },
  { file: "World.schema.json", good: { id: "w1", name: "test", constitution: "charter.4dce.v1", entities: [], assets: [] } },
];

describe("JSON Schema structure", () => {
  for (const { file } of schemas) {
    it(`${file} has valid schema structure`, () => {
      const schema = JSON.parse(readFileSync(join(schemasDir, file), "utf-8"));
      assert.ok(schema.$schema, "missing $schema");
      assert.ok(schema.$id, "missing $id");
      assert.ok(schema.title, "missing title");
      assert.equal(schema.type, "object");
      assert.ok(Array.isArray(schema.required), "missing required array");
      assert.ok(typeof schema.properties === "object", "missing properties");
    });
  }
});

describe("Schema validation", () => {
  for (const { file, good } of schemas) {
    const schema = JSON.parse(readFileSync(join(schemasDir, file), "utf-8"));

    it(`${file} validates correct object`, () => {
      const errors = validate(good, schema);
      assert.deepEqual(errors, []);
    });

    it(`${file} rejects empty object`, () => {
      const errors = validate({}, schema);
      assert.ok(errors.length > 0, "should have errors for empty object");
    });
  }
});

describe("GovernanceDecision schema edge cases", () => {
  const schema = JSON.parse(readFileSync(join(schemasDir, "GovernanceDecision.schema.json"), "utf-8"));

  it("rejects object missing verdict", () => {
    const errors = validate({ ok: true, reason: "test" }, schema);
    assert.ok(errors.some((e) => e.includes("verdict")));
  });

  it("rejects object missing reason", () => {
    const errors = validate({ ok: true, verdict: "allow" }, schema);
    assert.ok(errors.some((e) => e.includes("reason")));
  });
});

describe("ProvenanceFrame schema edge cases", () => {
  const schema = JSON.parse(readFileSync(join(schemasDir, "ProvenanceFrame.schema.json"), "utf-8"));

  it("rejects object missing timeSeconds", () => {
    const errors = validate({ intentId: "i1", timelineId: "t1", worldId: "w1", parameters: {} }, schema);
    assert.ok(errors.some((e) => e.includes("timeSeconds")));
  });

  it("rejects object missing parameters", () => {
    const errors = validate({ intentId: "i1", timelineId: "t1", worldId: "w1", timeSeconds: 0 }, schema);
    assert.ok(errors.some((e) => e.includes("parameters")));
  });
});
