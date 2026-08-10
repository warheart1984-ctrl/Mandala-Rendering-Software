// mrs/packages/renderer-core/src/render/rt4d/projection/ObservationModePresets.test.js
// Status: **passing with gaps** - ObservationModePresets resolution + list tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveObservationPreset,
  listObservationPresets,
  OBSERVATION_MODE_PRESETS,
  OBSERVATION_PRESET_BANNER,
  saveModePreference,
  loadModePreference,
  resolveSavedModeOrDefault,
} from "./ObservationModePresets.js";

describe("ObservationModePresets", () => {
  it("lists all preset IDs", () => {
    const presets = listObservationPresets();
    assert.deepEqual(presets.sort(), [
      "intentional_orbit",
      "perspective_w",
      "slice_hyperplane",
      "soft_caustic",
    ]);
  });

  it("resolves perspective_w preset with defaults", () => {
    const result = resolveObservationPreset("perspective_w");
    assert.equal(result.preset.modeId, "perspective_w");
    assert.equal(result.state.theta, 0);
    assert.equal(result.state.phi, 0);
    assert.equal(result.state.tau, 0);
    assert.equal(result.state.kappa, 0);
    assert.equal(result.state.modeId, "perspective_w");
    assert.equal(result.preset.liveLinkChoice, "Perspective4DTo3D");
    // mapObservationModeChoice returns hex string for observationModeId
    assert.equal(result.observationModeId, "0x1000000000000001");
    assert.equal(result.projectionPolicyId, 0);
    assert.equal(result.printSoT, false);
    assert.equal(result.authority, "observation");
  });

  it("resolves slice_hyperplane preset with defaults", () => {
    const result = resolveObservationPreset("slice_hyperplane");
    assert.equal(result.preset.modeId, "slice_hyperplane");
    assert.equal(result.state.theta, 0);
    assert.equal(result.state.phi, 0);
    assert.equal(result.state.tau, 0);
    assert.equal(result.state.kappa, 0);
    assert.equal(result.preset.liveLinkChoice, "WSliceConstant");
    assert.equal(result.observationModeId, "0x1000000000000002");
  });

  it("resolves intentional_orbit preset with defaults", () => {
    const result = resolveObservationPreset("intentional_orbit");
    assert.equal(result.preset.modeId, "intentional_orbit");
    assert.equal(result.state.theta, Math.PI / 6);
    assert.equal(result.state.phi, Math.PI / 4);
    assert.equal(result.state.tau, 0);
    assert.equal(result.state.kappa, 0);
    assert.equal(result.preset.liveLinkChoice, "Perspective4DTo3D");
  });

  it("resolves soft_caustic preset with defaults", () => {
    const result = resolveObservationPreset("soft_caustic");
    assert.equal(result.preset.modeId, "soft_caustic");
    assert.equal(result.state.theta, 0);
    assert.equal(result.state.phi, 0);
    assert.equal(result.state.tau, 0);
    assert.equal(result.state.kappa, 0.5);
    assert.equal(result.preset.liveLinkChoice, "Perspective4DTo3D");
  });

  it("overrides default params via overrides", () => {
    const result = resolveObservationPreset("perspective_w", {
      theta: Math.PI / 4,
      phi: Math.PI / 2,
      tau: 0.5,
      kappa: 0.2,
    });
    assert.equal(result.state.theta, Math.PI / 4);
    assert.equal(result.state.phi, Math.PI / 2);
    assert.equal(result.state.tau, 0.5);
    assert.equal(result.state.kappa, 0.2);
  });

  it("overrides only provided params (sparse override)", () => {
    const result = resolveObservationPreset("soft_caustic", { tau: 0.3 });
    assert.equal(result.state.theta, 0);
    assert.equal(result.state.phi, 0);
    assert.equal(result.state.tau, 0.3);
    assert.equal(result.state.kappa, 0.5);
  });

  it("ignores undefined override values", () => {
    const result = resolveObservationPreset("perspective_w", {
      theta: Math.PI / 4,
      phi: undefined,
      tau: 0.1,
      kappa: undefined,
    });
    assert.equal(result.state.theta, Math.PI / 4);
    assert.equal(result.state.phi, 0); // default
    assert.equal(result.state.tau, 0.1);
    assert.equal(result.state.kappa, 0); // default
  });

  it("throws on unknown preset", () => {
    assert.throws(
      () => resolveObservationPreset("unknown_preset"),
      /Unknown observation mode preset: unknown_preset/
    );
  });

  it("listObservationPresets returns all preset IDs", () => {
    const presets = listObservationPresets();
    assert.equal(presets.length, 4);
    assert.ok(presets.includes("perspective_w"));
    assert.ok(presets.includes("slice_hyperplane"));
    assert.ok(presets.includes("intentional_orbit"));
    assert.ok(presets.includes("soft_caustic"));
  });

  it("presets have correct status and banner", () => {
    for (const [id, preset] of Object.entries(OBSERVATION_MODE_PRESETS)) {
      assert.ok(preset.status === "enforced" || preset.status === "partial");
      assert.equal(preset.banner, "Observation mode — assist/preview only; CPU RT4D print remains SoT. Aperture ≠ print.");
      assert.equal(preset.printSoT, false);
      assert.equal(preset.authority, "observation");
    }
  });

  it("OBSERVATION_PRESET_BANNER has correct text", () => {
    assert.ok(OBSERVATION_PRESET_BANNER.includes("Aperture ≠ print"));
    assert.ok(OBSERVATION_PRESET_BANNER.includes("Observation"));
  });

  it("saveModePreference and loadModePreference persist mode", async () => {
    const testMode = "intentional_orbit";
    await saveModePreference(testMode);
    const loaded = await loadModePreference();
    assert.equal(loaded, testMode);
    // Clean up
    const fs = await import("fs");
    const path = await import("path");
    const fullPath = path.resolve("./.rt4d-mode-preference.json");
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  });

  it("loadModePreference returns null for missing file", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const fullPath = path.resolve("./.rt4d-mode-preference.json");
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    const loaded = await loadModePreference();
    assert.equal(loaded, null);
  });

it("resolveSavedModeOrDefault returns saved mode", async () => {
    await saveModePreference("soft_caustic");
    const result = await resolveSavedModeOrDefault();
    assert.equal(result.state.kappa, 0.5);
    // Clean up
    const fs = await import("fs");
    const path = await import("path");
    const fullPath = path.resolve("./.rt4d-mode-preference.json");
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  });

  it("resolveSavedModeOrDefault falls back to default when no saved mode", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const fullPath = path.resolve("./.rt4d-mode-preference.json");
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    const result = await resolveSavedModeOrDefault();
    assert.equal(result.state.modeId, "perspective_w");
  });

  it("resolveSavedModeOrDefault allows overrides", async () => {
    await saveModePreference("perspective_w");
    const result = await resolveSavedModeOrDefault({ tau: 0.5 });
    assert.equal(result.state.tau, 0.5);
    // Clean up
    const fs = await import("fs");
    const path = await import("path");
    const fullPath = path.resolve("./.rt4d-mode-preference.json");
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  });
});