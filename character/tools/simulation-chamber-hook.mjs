/**
 * Simulation Chamber hook — consume the character pipeline GLB instead of
 * spawning a third character system.
 *
 * Organ Map: this is Mandala (pixels) + Simulation Chamber (motion) + tools.
 * Do not invent a competing organ.
 *
 * Status: partial
 *   - char_rigged.glb is the contract plug-in point.
 *   - Simulation Chamber v3 still builds 15-part capsule humanoids from
 *     scripts/humanoid-avatar.mjs (RT4D primitives) unless `--holo`.
 *   - `--holo` skips capsules and records EntanglementRenderer COMPOSITE
 *     (boundary information density — not photoreal mesh).
 *   - Joint names / proportions are aligned so the adapter can land without
 *     a new character system.
 *   - RHFD/Möbius: this GLB (and the capsules) are substrate defects / petal
 *     ruptures. See mandala/substrate/MAPPING.md. Not a second character organ.
 *
 * Usage:
 *   node scripts/simulation-chamber.mjs <scene.json> --holo --creature Mythar --record composite
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CHARACTER_PIPELINE_ROOT = resolve(__dirname, "..");
export const CHAR_RIGGED_GLB = resolve(CHARACTER_PIPELINE_ROOT, "renders/char/char_rigged.glb");
export const CHAR_WIRE_GLB = resolve(CHARACTER_PIPELINE_ROOT, "renders/char/char_wire.glb");
export const CHAR_FINAL_GLB = resolve(CHARACTER_PIPELINE_ROOT, "renders/char/char_final.glb");
export const HOOK_STATUS = "partial";

export function describeCharacterHook(overridePath) {
  const path = overridePath ? resolve(overridePath) : CHAR_RIGGED_GLB;
  const present = existsSync(path);
  return {
    organ: "Simulation Chamber",
    pixelsOrgan: "Mandala",
    path,
    present,
    status: HOOK_STATUS,
    note: present
      ? "char_rigged.glb exists. Chamber may consume this asset; RT4D still uses humanoid-avatar primitives until a mesh adapter lands."
      : "char_rigged.glb not exported yet. Run: node character/cli.mjs build  (or node character/tools/export-character.mjs)",
    fallback: "scripts/humanoid-avatar.mjs",
    doNotDuplicate: true,
  };
}

export function resolveCharacterGlb(cliPath) {
  if (cliPath) return resolve(cliPath);
  return CHAR_RIGGED_GLB;
}
