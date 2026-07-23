/**
 * Lightweight WorldDocument v1 example validation.
 * Prefer ajv when present; otherwise structural checks sufficient for CI smoke.
 *
 * Status: partial — validates example shape against schema when ajv is available.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const examplePath = join(root, "examples/scenes/world-document-v1-example.json");
const schemaPath = join(root, "schemas/4d-engine/v1/WorldDocument.v1.schema.json");

function fail(msg) {
  console.error(`validate:world-document FAILED: ${msg}`);
  process.exit(1);
}

function structuralCheck(doc) {
  if (doc.schemaVersion !== "1.0") fail("schemaVersion must be \"1.0\"");
  if (typeof doc.id !== "string" || !doc.id) fail("id required");
  if (!Array.isArray(doc.entities) || doc.entities.length < 1) fail("entities minItems 1");
  for (const e of doc.entities) {
    if (!e.id || !e.geometry || !e.geometry.kind) fail(`entity ${e.id ?? "?"} missing geometry`);
    if (e.geometry.kind === "surface" && !e.geometry.surfaceId) {
      fail(`entity ${e.id} surface requires surfaceId`);
    }
  }
}

async function tryAjv(schema, doc) {
  const require = createRequire(import.meta.url);
  let Ajv;
  try {
    // Prefer draft-2020 class when available
    try {
      Ajv = require("ajv/dist/2020.js");
    } catch {
      Ajv = require("ajv");
    }
  } catch {
    try {
      const mod = await import("ajv/dist/2020.js").catch(() => import("ajv"));
      Ajv = mod.default ?? mod.Ajv;
    } catch {
      return false;
    }
  }
  try {
    const ajv = typeof Ajv === "function" ? new Ajv({ allErrors: true, strict: false }) : null;
    if (!ajv) return false;
    // Strip $schema meta ref issues on mismatched ajv builds
    const schemaBody = { ...schema };
    delete schemaBody.$schema;
    const validate = ajv.compile(schemaBody);
    const ok = validate(doc);
    if (!ok) {
      fail(JSON.stringify(validate.errors, null, 2));
    }
    return true;
  } catch (err) {
    console.warn(`ajv unavailable (${err?.message ?? err}); using structural checks only`);
    return false;
  }
}

async function main() {
  if (!existsSync(examplePath)) fail(`missing ${examplePath}`);
  if (!existsSync(schemaPath)) fail(`missing ${schemaPath}`);

  const doc = JSON.parse(readFileSync(examplePath, "utf8"));
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

  structuralCheck(doc);
  const usedAjv = await tryAjv(schema, doc);
  console.log(
    `validate:world-document OK (${usedAjv ? "ajv" : "structural"}) — ${examplePath}`
  );

  // Optional PLP stub smoke (does not fail package if surfaces missing)
  try {
    const plpUrl = pathToFileURL(
      join(root, "mrs/packages/renderer-core/src/plp/projectWorld.js")
    ).href;
    const { projectWorld } = await import(plpUrl);
    const result = projectWorld(doc, doc.defaultObservation);
    if (result.status !== "skeleton") {
      fail(`expected projectWorld status skeleton, got ${result.status}`);
    }
    if (!result.scene3D?.nodes || !result.lineageBundle?.entries) {
      fail("projectWorld missing scene3D/lineageBundle");
    }
    console.log(
      `projectWorld smoke OK — nodes=${result.scene3D.nodes.length} lineage=${result.lineageBundle.entries.length}`
    );
  } catch (err) {
    console.warn(`projectWorld smoke skipped/warned: ${err?.message ?? err}`);
  }
}

main().catch((err) => fail(err?.stack ?? String(err)));
