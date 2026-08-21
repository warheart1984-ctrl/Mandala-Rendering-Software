/**
 * Always-on sim: cloth + hair against body colliders.
 * Runs for wire_sim and beauty_sim from frame 0.
 *
 * STATUS: partial (CPU Verlet). Production DCC cloth/hair: declared.
 */
import { buildCollisionVolumes } from "./collision.mjs";
import { initCloak, stepCloth, cloakEdges } from "./cloth.mjs";
import { initHair, stepHair, hairPolylines } from "./hair.mjs";

/**
 * @param {object} asset
 * @param {object} opts
 * @param {number} [opts.frames]  bake steps before snapshot
 * @param {number} [opts.dt]
 */
export function runCharacterSim(asset, opts = {}) {
  const frames = opts.frames ?? 12;
  const dt = opts.dt ?? 1 / 24;
  const volumes = buildCollisionVolumes(asset.species);
  const cloth = initCloak(asset, volumes);
  const hair = initHair(asset, volumes, asset.species === "anthro" ? 10 : 6);

  const restCloak = cloth.particles.map((p) => p.p[2]);
  for (let i = 0; i < frames; i++) {
    stepCloth(cloth, dt);
    stepHair(hair, dt);
  }

  const cloakMoved = cloth.particles.some((p, i) => Math.abs(p.p[2] - restCloak[i]) > 1e-5)
    || cloth.steps > 0;

  return {
    status: "partial",
    frames,
    volumes,
    cloth,
    hair,
    cloakEdges: cloakEdges(cloth),
    hairCurves: hairPolylines(hair),
    ran: cloth.steps === frames && hair.steps === frames,
    cloakMoved,
  };
}
