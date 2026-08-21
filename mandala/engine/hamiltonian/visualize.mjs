/**
 * CPU PNG / JSON artifacts for the lattice Hamiltonian loop.
 * Output: output/mandala-hamiltonian/
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rgbToPng } from "../png.mjs";
import { HAMILTONIAN_OPERATOR, describeLatticeHamiltonian } from "../../substrate/hamiltonian.mjs";
import { simulateLattice, initRandomLattice, scanCoupling, SCAN_STATUS } from "./simulate.mjs";
import { describeGovernanceHamiltonian, createDemoGovernanceGraph, relaxGovernance } from "./governance.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = join(__dirname, "../../../output/mandala-hamiltonian");

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function colorize(v, vmin, vmax) {
  const t = Math.max(0, Math.min(1, (v - vmin) / (vmax - vmin || 1)));
  let r;
  let g;
  let b;
  if (t < 0.5) {
    const u = t * 2;
    r = lerp(20, 240, u);
    g = lerp(40, 240, u);
    b = lerp(180, 240, u);
  } else {
    const u = (t - 0.5) * 2;
    r = lerp(240, 200, u);
    g = lerp(240, 30, u);
    b = lerp(240, 30, u);
  }
  return [r | 0, g | 0, b | 0];
}

export function heatmapPng(sigma, shape, { scale = 8 } = {}) {
  const { nx, ny } = shape;
  const w = nx * scale;
  const h = ny * scale;
  const rgb = new Uint8Array(w * h * 3);
  let vmin = Infinity;
  let vmax = -Infinity;
  for (let i = 0; i < sigma.length; i++) {
    if (sigma[i] < vmin) vmin = sigma[i];
    if (sigma[i] > vmax) vmax = sigma[i];
  }
  if (vmax === vmin) {
    vmin -= 1;
    vmax += 1;
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const [r, g, b] = colorize(sigma[x + nx * y], vmin, vmax);
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const o = ((y * scale + py) * w + (x * scale + px)) * 3;
          rgb[o] = r;
          rgb[o + 1] = g;
          rgb[o + 2] = b;
        }
      }
    }
  }
  return { png: rgbToPng(w, h, rgb), width: w, height: h, vmin, vmax };
}

export function seriesChartPng(series, key, { width = 320, height = 160 } = {}) {
  const rgb = new Uint8Array(width * height * 3);
  rgb.fill(248);
  const xs = series.map((s) => s.t);
  const ys = series.map((s) => s[key]);
  let ymin = Math.min(...ys);
  let ymax = Math.max(...ys);
  if (ymax === ymin) {
    ymin -= 1;
    ymax += 1;
  }
  const x0 = 24;
  const y0 = 12;
  const x1 = width - 8;
  const y1 = height - 20;
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const o = (y * width + x) * 3;
    rgb[o] = r;
    rgb[o + 1] = g;
    rgb[o + 2] = b;
  };
  for (let x = x0; x < x1; x++) set(x, y1, 40, 40, 40);
  for (let y = y0; y < y1; y++) set(x0, y, 40, 40, 40);
  const maxX = Math.max(...xs, 1);
  let px = x0;
  let py = y1;
  for (let i = 0; i < series.length; i++) {
    const x = Math.round(x0 + ((x1 - x0) * xs[i]) / maxX);
    const y = Math.round(y1 - ((y1 - y0) * (ys[i] - ymin)) / (ymax - ymin));
    if (i > 0) {
      const n = Math.max(Math.abs(x - px), Math.abs(y - py), 1);
      for (let s = 0; s <= n; s++) {
        const u = s / n;
        set((px + (x - px) * u) | 0, (py + (y - py) * u) | 0, 30, 90, 180);
      }
    }
    px = x;
    py = y;
  }
  return rgbToPng(width, height, rgb);
}

export function writeHamiltonianArtifacts({
  outDir = DEFAULT_OUT,
  nx = 16,
  ny = 16,
  seed = 7,
} = {}) {
  mkdirSync(outDir, { recursive: true });
  const init = initRandomLattice({ nx, ny, seed, scale: 0.9 });
  const ssb = { m2: -0.6, lambda: 0.25, J: 0.35, eta: 0.08 };
  const run = simulateLattice({
    sigma: init.sigma,
    shape: init.shape,
    params: ssb,
    maxSteps: 48,
  });
  const heat = heatmapPng(run.sigma, run.shape, { scale: 10 });
  const heatPath = join(outDir, "sigma-heatmap.png");
  writeFileSync(heatPath, heat.png);
  const energyPng = seriesChartPng(run.series, "H");
  const energyPngPath = join(outDir, "energy-vs-time.png");
  writeFileSync(energyPngPath, energyPng);
  const energyJsonPath = join(outDir, "energy-vs-time.json");
  writeFileSync(energyJsonPath, JSON.stringify(run.series, null, 2));
  const scan = scanCoupling({ nx, ny, seed, maxSteps: 36 });
  const scanPath = join(outDir, "order-parameter-scan.json");
  writeFileSync(scanPath, JSON.stringify(scan, null, 2));
  const scanPng = seriesChartPng(
    scan.points.map((p, i) => ({ t: i, H: p.meanAbs })),
    "H",
  );
  const scanPngPath = join(outDir, "order-parameter-vs-m2.png");
  writeFileSync(scanPngPath, scanPng);

  const gov = createDemoGovernanceGraph();
  const govPass = relaxGovernance(gov, { steps: 12 });
  const govPath = join(outDir, "hgov-series.json");
  writeFileSync(
    govPath,
    JSON.stringify(
      {
        describe: describeGovernanceHamiltonian(),
        series: govPass.series,
        H: govPass.H,
      },
      null,
      2,
    ),
  );

  const receipt = {
    type: "mandala-hamiltonian-receipt",
    status: "partial",
    physics: {
      operator: HAMILTONIAN_OPERATOR,
      describe: describeLatticeHamiltonian(),
      shape: run.shape,
      params: run.params,
      steps: run.steps,
      stopped: run.stopped,
      H0: run.series[0].H,
      Hfinal: run.series[run.series.length - 1].H,
      energyNonIncreasing: run.series.every((s, i) => i === 0 || s.H <= run.series[i - 1].H + 1e-5),
    },
    scan,
    scanStatus: SCAN_STATUS,
    singularityReplacement:
      "Structural phase-change analogue on the lattice (order parameter vs m²). Not infinite density. Not a proven critical exponent.",
    governance: describeGovernanceHamiltonian(),
    artifacts: {
      heatmap: heatPath,
      energyPng: energyPngPath,
      energyJson: energyJsonPath,
      scanJson: scanPath,
      scanPng: scanPngPath,
      hgov: govPath,
    },
  };
  const receiptPath = join(outDir, "receipt.json");
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  return { outDir, receipt, receiptPath, heatPath, energyPngPath, energyJsonPath, scanPath };
}
