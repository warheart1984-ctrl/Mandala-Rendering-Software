import assert from "assert";
import { vec4, dot, length, normalize, scale, add, sub } from "../math/vec4.js";
import {
  uniformSampleS3, uniformPDF_S3, cosineWeightedSampleS3, cosineWeightedPDF_S3,
  uniformSampleS2, buildONBFromNormal, alignToNormalS3, S3_AREA
} from "../math/s3.js";
import { Lambertian4D } from "../material/bsdf4d.js";
import { GGX4D } from "../material/ggx4d.js";
import { Transform4D } from "../math/transform.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
}

function approx(a, b, tol = 0.05) {
  return Math.abs(a - b) < tol;
}

// ─── 1. S³ Uniform Sampler ───
console.log("\n--- S³ Uniform Sampler ---");

test("uniformSampleS3 returns unit vectors", () => {
  for (let i = 0; i < 1000; i++) {
    const v = uniformSampleS3(Math.random(), Math.random(), Math.random());
    assert(approx(length(v), 1.0, 1e-6), `length = ${length(v)}`);
  }
});

test("uniformSampleS3 mean direction ≈ origin", () => {
  let sx = 0, sy = 0, sz = 0, sw = 0;
  const N = 100000;
  for (let i = 0; i < N; i++) {
    const v = uniformSampleS3(Math.random(), Math.random(), Math.random());
    sx += v.x; sy += v.y; sz += v.z; sw += v.w;
  }
  assert(approx(sx / N, 0, 0.02), `mean x = ${sx / N}`);
  assert(approx(sy / N, 0, 0.02), `mean y = ${sy / N}`);
  assert(approx(sz / N, 0, 0.02), `mean z = ${sz / N}`);
  assert(approx(sw / N, 0, 0.02), `mean w = ${sw / N}`);
});

test("uniformPDF_S3 = 1/S3_AREA", () => {
  assert(approx(uniformPDF_S3(), 1 / S3_AREA, 1e-10));
});

// ─── 2. Cosine-Weighted Sampler ───
console.log("\n--- Cosine-Weighted Sampler ---");

test("cosineWeightedSampleS3 returns unit vectors", () => {
  const n = vec4(0, 0, 1, 0);
  for (let i = 0; i < 1000; i++) {
    const { direction } = cosineWeightedSampleS3(Math.random(), Math.random(), Math.random(), n);
    assert(approx(length(direction), 1.0, 1e-6), `length = ${length(direction)}`);
  }
});

test("cosine-weighted samples are in the hemisphere around normal", () => {
  const n = vec4(0, 0, 1, 0);
  for (let i = 0; i < 10000; i++) {
    const { direction } = cosineWeightedSampleS3(Math.random(), Math.random(), Math.random(), n);
    assert(dot(direction, n) > -1e-6, `dot = ${dot(direction, n)}`);
  }
});

test("cosine-weighted PDF integrates to ~1 (uniform-estimate MC)", () => {
  const n = vec4(0, 0, 1, 0);
  let sum = 0;
  let count = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) {
    const v = uniformSampleS3(Math.random(), Math.random(), Math.random());
    if (dot(v, n) <= 0) continue;
    sum += cosineWeightedPDF_S3(v, n);
    count++;
  }
  // Uniform samples on full S³ (area 2π²), reject hemisphere. Effective area = 2π².
  // estimate = (2π² × sum) / N (N = total draws, not just hemisphere ones)
  const estimate = (S3_AREA * sum) / N;
  assert(approx(estimate, 1.0, 0.05), `∫ p dΩ ≈ ${estimate}`);
});

test("cosineWeightedPDF_S3 = 3cosθ/(4π) for known direction", () => {
  const n = vec4(0, 0, 1, 0);
  const wo = vec4(0, 0, 1, 0);
  const pdf = cosineWeightedPDF_S3(wo, n);
  const expected = 3 / (4 * Math.PI);
  assert(approx(pdf, expected, 1e-6), `pdf = ${pdf}, expected = ${expected}`);
});

// ─── 3. ONB Construction ───
console.log("\n--- ONB Construction ---");

test("buildONBFromNormal produces orthonormal frame", () => {
  const n = normalize(vec4(1, 2, 3, 4));
  const { T1, T2, T3 } = buildONBFromNormal(n);

  assert(approx(length(T1), 1.0, 1e-6), "T1 unit");
  assert(approx(length(T2), 1.0, 1e-6), "T2 unit");
  assert(approx(length(T3), 1.0, 1e-6), "T3 unit");
  assert(approx(dot(T1, T2), 0, 1e-6), "T1·T2=0");
  assert(approx(dot(T1, T3), 0, 1e-6), "T1·T3=0");
  assert(approx(dot(T2, T3), 0, 1e-6), "T2·T3=0");
  assert(approx(dot(n, T1), 0, 1e-6), "n·T1=0");
  assert(approx(dot(n, T2), 0, 1e-6), "n·T2=0");
  assert(approx(dot(n, T3), 0, 1e-6), "n·T3=0");
});

test("buildONBFromNormal works for axis-aligned normal (0,0,1,0)", () => {
  const n = vec4(0, 0, 1, 0);
  const { T1, T2, T3 } = buildONBFromNormal(n);

  assert(approx(length(T1), 1.0, 1e-6), "T1 unit");
  assert(approx(length(T2), 1.0, 1e-6), "T2 unit");
  assert(approx(length(T3), 1.0, 1e-6), "T3 unit");
  assert(approx(dot(T1, T2), 0, 1e-6), "T1·T2=0");
  assert(approx(dot(T1, T3), 0, 1e-6), "T1·T3=0");
  assert(approx(dot(T2, T3), 0, 1e-6), "T2·T3=0");
  assert(approx(dot(n, T1), 0, 1e-6), "n·T1=0");
  assert(approx(dot(n, T2), 0, 1e-6), "n·T2=0");
  assert(approx(dot(n, T3), 0, 1e-6), "n·T3=0");
});

test("alignToNormalS3 maps canonical up to target normal", () => {
  const target = normalize(vec4(1, 1, 1, 1));
  const canonicalUp = vec4(0, 0, 0, 1);
  const aligned = alignToNormalS3(canonicalUp, target);
  assert(approx(dot(aligned, target), 1.0, 1e-6), `dot = ${dot(aligned, target)}`);
});

// ─── 4. Lambertian BRDF: energy conservation ───
console.log("\n--- Lambertian4D Energy Conservation ---");

test("Lambertian BRDF = 3ρ/(4π) (constant, no cosθ in BRDF)", () => {
  const mat = new Lambertian4D(vec4(1, 1, 1, 1));
  const n = vec4(0, 0, 1, 0);
  const wi = vec4(0, 0, 1, 0);
  const wo = normalize(vec4(0.5, 0.5, 0.5, 0));
  const val = mat.evaluate(wi, wo, n);
  const expected = 3 / (4 * Math.PI);
  assert(approx(val.x, expected, 1e-6), `BRDF x = ${val.x}, expected = ${expected}`);
  assert(approx(val.y, expected, 1e-6), `BRDF y = ${val.y}`);
  assert(approx(val.z, expected, 1e-6), `BRDF z = ${val.z}`);
});

test("Lambertian PDF integrates to ~1 (uniform-estimate MC)", () => {
  const mat = new Lambertian4D(vec4(1, 1, 1, 1));
  const n = vec4(0, 0, 1, 0);
  const wi = vec4(0, 0, 1, 0);
  let sum = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) {
    const v = uniformSampleS3(Math.random(), Math.random(), Math.random());
    if (dot(v, n) <= 0) continue;
    sum += mat.pdf(wi, v, n);
  }
  const estimate = (S3_AREA * sum) / N;
  assert(approx(estimate, 1.0, 0.05), `∫ pdf dΩ ≈ ${estimate}`);
});

test("Lambertian cosine-weighted hemisphere integral ≈ albedo (white furnace)", () => {
  const albedo = 0.8;
  const mat = new Lambertian4D(vec4(albedo, albedo, albedo, 1));
  const n = vec4(0, 0, 1, 0);
  const wi = vec4(0, 0, 1, 0);
  let sum = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) {
    const { direction, pdf } = cosineWeightedSampleS3(Math.random(), Math.random(), Math.random(), n);
    const f = mat.evaluate(wi, direction, n);
    const cosTheta = Math.abs(dot(direction, n));
    sum += f.x * cosTheta / (pdf + 1e-12);
  }
  const estimate = sum / N;
  assert(approx(estimate, albedo, 0.05), `white furnace = ${estimate}, expected ≈ ${albedo}`);
});

// ─── 5. Lambertian: reciprocity ───
console.log("\n--- Lambertian4D Reciprocity ---");

test("f(wi,wo) = f(wo,wi) for Lambertian", () => {
  const mat = new Lambertian4D(vec4(0.7, 0.8, 0.9, 1));
  const n = vec4(0, 0, 1, 0);
  const wi = normalize(vec4(0.3, 0.4, 0.5, 0.1));
  const wo = normalize(vec4(-0.2, 0.6, 0.3, 0.4));
  const f1 = mat.evaluate(wi, wo, n);
  const f2 = mat.evaluate(wo, wi, n);
  assert(approx(f1.x, f2.x, 1e-10), `f1.x=${f1.x} ≠ f2.x=${f2.x}`);
  assert(approx(f1.y, f2.y, 1e-10), `f1.y=${f1.y} ≠ f2.y=${f2.y}`);
  assert(approx(f1.z, f2.z, 1e-10), `f1.z=${f1.z} ≠ f2.z=${f2.z}`);
});

// ─── 6. GGX4D: NDF normalization ───
console.log("\n--- GGX4D NDF ---");

test("GGX NDF evaluates to non-negative for all roughness", () => {
  const mat = new GGX4D(vec4(1, 1, 1, 1), 0.3);
  const n = vec4(0, 0, 1, 0);
  const wi = vec4(0, 0, 1, 0);
  for (let i = 0; i < 1000; i++) {
    const wo = uniformSampleS3(Math.random(), Math.random(), Math.random());
    const val = mat.evaluate(wi, wo, n);
    assert(val.x >= 0, `negative GGX value: ${val.x}`);
    assert(val.y >= 0, `negative GGX value: ${val.y}`);
    assert(val.z >= 0, `negative GGX value: ${val.z}`);
  }
});

test("GGX sample returns finite pdf and direction", () => {
  const mat = new GGX4D(vec4(1, 1, 1, 1), 0.5);
  const n = vec4(0, 0, 1, 0);
  const wi = normalize(vec4(0.1, 0.2, 0.9, 0.1));
  const sample = mat.sample(wi, n, 0.5, 0.5, 0.5);
  assert(sample.pdf >= 0, `negative pdf: ${sample.pdf}`);
  assert(sample.pdf <= 50, `unreasonably large pdf: ${sample.pdf}`);
  assert(length(sample.wo) > 0.9, `wo not unit: length=${length(sample.wo)}`);
});

// ─── 7. Monte Carlo convergence ───
console.log("\n--- MC Convergence ---");

test("GGX MC estimate converges with increasing samples", () => {
  const mat = new GGX4D(vec4(0.5, 0.5, 0.5, 1), 0.4);
  const n = vec4(0, 0, 1, 0);
  const wi = normalize(vec4(0.3, 0.4, 0.8, 0.1));

  function estimate(N) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const { direction, pdf } = cosineWeightedSampleS3(Math.random(), Math.random(), Math.random(), n);
      const f = mat.evaluate(wi, direction, n);
      const cosTheta = Math.abs(dot(direction, n));
      sum += f.x * cosTheta / (pdf + 1e-12);
    }
    return sum / N;
  }

  const e1k = estimate(1000);
  const e10k = estimate(10000);
  const e100k = estimate(100000);
  assert(Math.abs(e100k - e10k) < Math.abs(e1k - e10k) + 0.01,
    `estimates should converge: 1k=${e1k.toFixed(4)} 10k=${e10k.toFixed(4)} 100k=${e100k.toFixed(4)}`);
});

// ─── 8. SO(4) Invariance ───
console.log("\n--- SO(4) Invariance ---");

function randomSO4() {
  const planes = ["xy", "xz", "xw", "yz", "yw", "zw"];
  let R = Transform4D.rotate("xy", 0);
  for (const plane of planes) {
    const angle = Math.random() * 2 * Math.PI;
    const rot = Transform4D.rotate(plane, angle);
    R = R.mul(rot);
  }
  return R;
}

test("Lambertian BRDF is SO(4) invariant", () => {
  const mat = new Lambertian4D(vec4(0.7, 0.8, 0.9, 1));
  const n = normalize(vec4(1, 2, 3, 4));
  const wi = normalize(vec4(0.3, -0.5, 0.8, 0.1));
  const wo = normalize(vec4(-0.2, 0.6, 0.3, 0.4));
  const f1 = mat.evaluate(wi, wo, n);

  for (let i = 0; i < 20; i++) {
    const R = randomSO4();
    const rn = normalize(R.applyDir(n));
    const rwi = normalize(R.applyDir(wi));
    const rwo = normalize(R.applyDir(wo));
    const f2 = mat.evaluate(rwi, rwo, rn);
    assert(approx(f1.x, f2.x, 1e-4), `Lambertian SO(4) fail x: ${f1.x} vs ${f2.x}`);
    assert(approx(f1.y, f2.y, 1e-4), `Lambertian SO(4) fail y: ${f1.y} vs ${f2.y}`);
    assert(approx(f1.z, f2.z, 1e-4), `Lambertian SO(4) fail z: ${f1.z} vs ${f2.z}`);
  }
});

test("GGX BRDF is SO(4) invariant", () => {
  const mat = new GGX4D(vec4(0.8, 0.8, 0.8, 1), 0.3);
  const n = normalize(vec4(1, 2, 3, 4));
  const wi = normalize(vec4(0.3, -0.5, 0.8, 0.1));
  const wo = normalize(vec4(-0.2, 0.6, 0.3, 0.4));
  const f1 = mat.evaluate(wi, wo, n);

  for (let i = 0; i < 20; i++) {
    const R = randomSO4();
    const rn = normalize(R.applyDir(n));
    const rwi = normalize(R.applyDir(wi));
    const rwo = normalize(R.applyDir(wo));
    const f2 = mat.evaluate(rwi, rwo, rn);
    assert(approx(f1.x, f2.x, 1e-4), `GGX SO(4) fail x: ${f1.x} vs ${f2.x}`);
    assert(approx(f1.y, f2.y, 1e-4), `GGX SO(4) fail y: ${f1.y} vs ${f2.y}`);
    assert(approx(f1.z, f2.z, 1e-4), `GGX SO(4) fail z: ${f1.z} vs ${f2.z}`);
  }
});

test("Cosine-weighted sampler pdf is SO(4) invariant", () => {
  const n = normalize(vec4(1, 2, 3, 4));
  const wo = normalize(vec4(0.5, -0.3, 0.7, 0.1));
  const pdf1 = cosineWeightedPDF_S3(wo, n);

  for (let i = 0; i < 20; i++) {
    const R = randomSO4();
    const rn = normalize(R.applyDir(n));
    const rwo = normalize(R.applyDir(wo));
    const pdf2 = cosineWeightedPDF_S3(rwo, rn);
    assert(approx(pdf1, pdf2, 1e-4), `pdf SO(4) fail: ${pdf1} vs ${pdf2}`);
  }
});

test("Cosine-weighted sampler produces rotated directions under SO(4)", () => {
  const n = normalize(vec4(1, 2, 3, 4));
  const R = randomSO4();
  const rn = normalize(R.applyDir(n));

  const seed = 42;
  function seededRng() {
    let s = seed;
    return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  }

  const rng1 = seededRng();
  const { direction: d1 } = cosineWeightedSampleS3(rng1(), rng1(), rng1(), n);
  const rd1 = normalize(R.applyDir(d1));

  const rng2 = seededRng();
  const { direction: d2 } = cosineWeightedSampleS3(rng2(), rng2(), rng2(), rn);
  assert(approx(length(d2), 1.0, 1e-6), "rotated sample unit length");
  assert(dot(d2, rn) > -1e-6, "rotated sample in hemisphere");
});

// ─── 9. GGX Reciprocity ───
console.log("\n--- GGX4D Reciprocity ---");

test("GGX f(wi,wo) = f(wo,wi) for random configurations", () => {
  const mat = new GGX4D(vec4(0.6, 0.7, 0.8, 1), 0.4);
  const n = vec4(0, 0, 1, 0);

  for (let i = 0; i < 100; i++) {
    const wi = uniformSampleS3(Math.random(), Math.random(), Math.random());
    const wo = uniformSampleS3(Math.random(), Math.random(), Math.random());
    if (dot(wi, n) <= 0 || dot(wo, n) <= 0) continue;

    const f1 = mat.evaluate(wi, wo, n);
    const f2 = mat.evaluate(wo, wi, n);
    assert(approx(f1.x, f2.x, 1e-6), `GGX reciprocity fail x: ${f1.x} vs ${f2.x}`);
    assert(approx(f1.y, f2.y, 1e-6), `GGX reciprocity fail y: ${f1.y} vs ${f2.y}`);
    assert(approx(f1.z, f2.z, 1e-6), `GGX reciprocity fail z: ${f1.z} vs ${f2.z}`);
  }
});

test("GGX f(wi,wo) = f(wo,wi) for rotated configurations", () => {
  const mat = new GGX4D(vec4(0.6, 0.7, 0.8, 1), 0.4);

  for (let i = 0; i < 50; i++) {
    const n = normalize(vec4(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5));
    const wi = cosineWeightedSampleS3(Math.random(), Math.random(), Math.random(), n).direction;
    const wo = cosineWeightedSampleS3(Math.random(), Math.random(), Math.random(), n).direction;

    const f1 = mat.evaluate(wi, wo, n);
    const f2 = mat.evaluate(wo, wi, n);
    assert(approx(f1.x, f2.x, 1e-6), `GGX reciprocity rotated fail x: ${f1.x} vs ${f2.x}`);
    assert(approx(f1.y, f2.y, 1e-6), `GGX reciprocity rotated fail y: ${f1.y} vs ${f2.y}`);
    assert(approx(f1.z, f2.z, 1e-6), `GGX reciprocity rotated fail z: ${f1.z} vs ${f2.z}`);
  }
});

// ─── Summary ───
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
