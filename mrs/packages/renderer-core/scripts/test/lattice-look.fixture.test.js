/**
 * Lattice look fixture — structural gates vs the glass/chrome reference intent.
 *
 * Drive-G-1: This is NOT a pixel-golden of the marketing still. It asserts
 * geometry (OrientedCapsule tubes), material stack, dark-studio postprocess
 * flags, and luminance bands that separate the bead-draft failure mode from
 * the glass-chrome lattice path.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderStill, resolveSceneDescriptor } from "../render-still.mjs";

const LATTICE_PROMPT =
  "A floating tesseract made of neon-blue lattice beams, suspended inside a radial " +
  "mandala grid. The core emits a pulsing white energy sphere, illuminating the structure " +
  "with studio-grade rim lighting. Surrounding geometry forms concentric fractal rings, " +
  "each with reflective metallic surfaces and soft volumetric glow.";

const FIXTURE_SEED = 526562436;

test("lattice look fixture: capsules + material stack + dark studio postprocess", () => {
  assert.equal(
    resolveSceneDescriptor({ prompt: LATTICE_PROMPT, seed: FIXTURE_SEED }).scene,
    "tesseract-lattice",
  );

  const { provenance, png } = renderStill({
    prompt: LATTICE_PROMPT,
    seed: FIXTURE_SEED,
    width: 64,
    height: 64,
    samples: 4,
    maxDepth: 3,
  });

  assert.ok(Buffer.isBuffer(png) && png.length > 100);
  assert.equal(provenance.scene, "tesseract-lattice");
  assert.equal(provenance.composition.beam_capsules, 32);
  assert.equal(provenance.composition.beam_spheres, 0);
  assert.equal(provenance.composition.spoke_capsules, 6);
  assert.equal(provenance.composition.ring_tori, 2);
  assert.equal(provenance.composition.ring_capsules, 48);
  assert.equal(provenance.composition.ring_nodes, 0);
  assert.equal(provenance.composition.material_stack, "glass_tube_beam+chrome_joint+core_glow");
  assert.equal(provenance.composition.beam_material, "emissive-tube"); // draft spp
  assert.match(provenance.composition.geometry_note, /OrientedCapsule/);
  assert.match(provenance.composition.geometry_note, /chord/);
  assert.match(provenance.composition.postprocess, /bloom/);
  assert.match(provenance.composition.postprocess, /dark-studio/);

  // Center should stay lit (core + tubes); floor-only grey must not pass.
  assert.ok(
    provenance.mean_luminance_center > 10,
    `center ROI ${provenance.mean_luminance_center} too dark for lattice fixture`,
  );
  assert.ok(
    provenance.mean_luminance > 4,
    `mean luminance ${provenance.mean_luminance} collapsed (near-black still)`,
  );
  // Dark studio: mean should not blow out like an overexposed grey plate.
  assert.ok(
    provenance.mean_luminance < 180,
    `mean luminance ${provenance.mean_luminance} looks washed out`,
  );
});

test("lattice look fixture: high-spp switches beams to dielectric glass", () => {
  const { provenance } = renderStill({
    prompt: LATTICE_PROMPT,
    seed: FIXTURE_SEED,
    width: 32,
    height: 32,
    samples: 12,
    maxDepth: 4,
  });
  assert.equal(provenance.composition.beam_material, "dielectric-glass");
  assert.equal(provenance.composition.beam_capsules, 32);
});
