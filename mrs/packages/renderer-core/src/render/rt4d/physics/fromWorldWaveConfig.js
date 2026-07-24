/**
 * Build WaveField + wire CurvatureField / ForceField from WorldDocument `wave` — **skeleton**.
 * Does not upload to B2.
 */
import { WaveField } from "./WaveField.js";
import { CurvatureField } from "./CurvatureField.js";
import { ForceField } from "./ForceField.js";

/**
 * @param {object|null|undefined} waveConfig
 * @param {object} [extras]
 */
export function fromWorldWaveConfig(waveConfig, extras = {}) {
  const enabled = Boolean(waveConfig?.enabled);
  let waveField = null;
  if (enabled && waveConfig) {
    waveField = new WaveField({
      gridSize: waveConfig.gridSize,
      c: waveConfig.c,
      dt: waveConfig.dt,
      initialState: waveConfig.initialState,
    });
  }

  const curvature = new CurvatureField({
    ...(extras.curvature ?? {}),
    beta: waveConfig?.beta ?? extras.curvature?.beta ?? 0,
    waveField,
  });

  const force = new ForceField({
    ...(extras.force ?? {}),
    gamma: waveConfig?.gamma ?? extras.force?.gamma ?? 0,
    waveDir: waveConfig?.waveDir ?? extras.force?.waveDir,
    waveField,
  });

  return { enabled, waveField, curvature, force };
}
