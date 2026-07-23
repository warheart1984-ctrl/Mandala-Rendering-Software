#!/usr/bin/env node

/**
 * 4D Renderer CLI — parametric surfaces, hyperplane slicing, lattice/voxel fields.
 *
 * Usage:
 *   node src/cli.js list
 *   node src/cli.js render --surface clifford-torus --frames 240 --mode wireframe
 *   node src/cli.js slice --surface clifford-torus --slice-w 0 --single
 *   node src/cli.js lattice --fill gyroid --res 24 --single
 */
import { Command } from "commander";
import { createCanvas } from "canvas";
import { listSurfaces, getSurface, sampleSurface } from "./surfaces/index.js";
import { renderMovie, renderFrameToBuffer } from "./pipeline/movie-pipeline.js";
import { createScene } from "./pipeline/scene.js";
import { Camera4D } from "./camera/Camera4D.js";
import { HyperplaneSlicer } from "./render/slicer.js";
import {
  createLattice,
  fillLattice,
  marchingCubes4D,
  latticeStats,
  hypersphereDensity,
  torus4dDensity,
  gyroid4dDensity,
  sphereGrid4d,
  fbm4d,
  seedNoise,
  noise4d,
  warp4d,
} from "./lattice/index.js";
import { drawWireframe, drawVertices } from "./render/wireframe.js";
import { drawSolid } from "./render/solid.js";
import { project4Dto2D } from "./math/project.js";
import { cinematicRotation } from "./math/mat4.js";
import { densityQuantile, filterMeshComponents, latticeDiagnostics, latticePresets, normalizeMesh4D, weldMesh } from "./lattice/mesh-tools.js";
import { applyFit, fitTransform } from "./render/framing.js";
import { getRenderProfile } from "./render/profiles.js";
import fs from "node:fs";
import path from "node:path";

const program = new Command();

program
  .name("4d-render")
  .description("4D renderer — parametric surfaces, hyperplane slicing, lattice/voxel fields")
  .version("1.0.0");

// ── List command ──────────────────────────────────────────────────

program
  .command("list")
  .description("List available parametric surfaces and fill functions")
  .action(() => {
    const surfaces = listSurfaces();
    console.log("Parametric surfaces:\n");
    for (const s of surfaces) {
      console.log(`  ${s.id.padEnd(20)} ${s.name}`);
    }
    console.log("\nLattice fill functions:\n");
    console.log("  hypersphere        4D hypersphere density");
    console.log("  torus              4D Clifford torus density");
    console.log("  gyroid             4D gyroid (triply periodic)");
    console.log("  sphere-grid        Grid of hyperspheres");
    console.log("  noise              fBm noise field");
    console.log("  ridged             Ridged noise");
    console.log("  warped-gyroid      Domain-warped gyroid");
    console.log();
  });

// ── Render command (parametric surfaces) ──────────────────────────

program
  .command("render")
  .description("Render a parametric 4D surface to PNG sequence + MP4")
  .option("-s, --surface <id>", "Surface to render", "clifford-torus")
  .option("-f, --frames <n>", "Number of frames", "240")
  .option("--fps <n>", "Frames per second", "30")
  .option("-w, --width <px>", "Output width", "1920")
  .option("--height <px>", "Output height", "1080")
  .option("-m, --mode <mode>", "Render mode: wireframe or solid")
  .option("-r, --resolution <n>", "Mesh resolution", "64")
  .option("-o, --output <dir>", "Output directory", "output")
  .option("--d4 <dist>", "4D camera distance", "4.0")
  .option("--d3 <dist>", "3D camera distance", "4.0")
  .option("--scale <n>", "Pixel scale", "80")
  .option("--bg <color>", "Background color (profile default when omitted)")
  .option("--single", "Render a single frame")
  .option("--profile <name>", "Render profile: technical, cinematic, solid-copper, lattice", "technical")
  .option("--supersample <n>", "Antialiasing factor 1-4", "1")
  .option("--no-fit", "Disable adaptive framing")
  .option("--stream", "Stream frames directly to FFmpeg without PNG intermediates")
  .action(async (opts) => {
    try {
      const surface = getSurface(opts.surface);
      if (opts.single) {
        const scene = createScene({
          surface: opts.surface, resolution: Number(opts.resolution),
          width: Number(opts.width), height: Number(opts.height),
          d4: Number(opts.d4), d3: Number(opts.d3), scale: Number(opts.scale),
          renderMode: opts.mode, background: opts.bg, profile: opts.profile,
          supersample: Number(opts.supersample), scaleMode: opts.fit === false ? "fixed" : "fit",
        });
        const mesh = sampleSurface(surface, scene.resolution);
        const buffer = renderFrameToBuffer(mesh, 0, scene);
        fs.mkdirSync(path.resolve(opts.output), { recursive: true });
        const outPath = path.resolve(opts.output, `${surface.id}-single.png`);
        fs.writeFileSync(outPath, buffer);
        console.log(`Single frame saved: ${outPath}`);
        return;
      }
      await renderMovie({
        surface: opts.surface, resolution: Number(opts.resolution),
        width: Number(opts.width), height: Number(opts.height),
        frames: Number(opts.frames), fps: Number(opts.fps),
        d4: Number(opts.d4), d3: Number(opts.d3), scale: Number(opts.scale),
        renderMode: opts.mode, background: opts.bg, outputDir: opts.output,
        profile: opts.profile, supersample: Number(opts.supersample), scaleMode: opts.fit === false ? "fixed" : "fit", streamToFfmpeg: Boolean(opts.stream),
      });
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ── Slice command (hyperplane slicer) ─────────────────────────────

program
  .command("slice")
  .description("Slice a 4D mesh with a hyperplane and render the cross-section")
  .option("-s, --surface <id>", "Surface to slice", "clifford-torus")
  .option("-r, --resolution <n>", "Mesh resolution", "48")
  .option("-w, --width <px>", "Output width", "1920")
  .option("--height <px>", "Output height", "1080")
  .option("-m, --mode <mode>", "Render mode: wireframe, solid, both", "both")
  .option("-o, --output <dir>", "Output directory", "output")
  .option("--d3 <dist>", "3D camera distance", "4.0")
  .option("--scale <n>", "Pixel scale", "80")
  .option("--bg <color>", "Background color", "#0e1216")
  .option("--normal-x <n>", "Hyperplane normal X component", "0")
  .option("--normal-y <n>", "Hyperplane normal Y component", "0")
  .option("--normal-z <n>", "Hyperplane normal Z component", "0")
  .option("--normal-w <n>", "Hyperplane normal W component", "1")
  .option("--offset <n>", "Hyperplane offset d", "0")
  .option("--orbit-speed <n>", "Camera orbit speed", "1.0")
  .option("--slide-speed <n>", "Hyperplane slide speed (0 = static)", "0")
  .option("-f, --frames <n>", "Number of frames", "120")
  .option("--fps <n>", "Frames per second", "30")
  .option("--single", "Render a single frame")
  .option("--projection <mode>", "Projection mode: perspective, orthographic", "perspective")
  .action(async (opts) => {
    try {
      const surface = getSurface(opts.surface);
      const mesh = sampleSurface(surface, Number(opts.resolution));

      const camera = new Camera4D({
        width: Number(opts.width),
        height: Number(opts.height),
        d3: Number(opts.d3),
        scale: Number(opts.scale),
        normal: {
          x: Number(opts.normalX),
          y: Number(opts.normalY),
          z: Number(opts.normalZ),
          w: Number(opts.normalW),
        },
        d: Number(opts.offset),
        projectionMode: opts.projection,
      });

      const slicer = new HyperplaneSlicer(camera, {
        renderMode: opts.mode,
        background: opts.bg,
      });

      fs.mkdirSync(path.resolve(opts.output), { recursive: true });

      if (opts.single) {
        camera.orbit(0, Number(opts.orbitSpeed));
        const canvas = createCanvas(Number(opts.width), Number(opts.height));
        const ctx = canvas.getContext("2d");
        slicer.renderFrame(ctx, mesh);
        const outPath = path.resolve(opts.output, `${surface.id}-slice.png`);
        fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
        console.log(`Slice frame saved: ${outPath}`);
        const stats = camera.validate();
        console.log(`Camera valid: ${stats.valid}`);
        return;
      }

      // Sequence render
      const totalFrames = Number(opts.frames);
      const fps = Number(opts.fps);
      const orbitSpeed = Number(opts.orbitSpeed);
      const slideSpeed = Number(opts.slideSpeed);
      const startTime = performance.now();

      for (let frame = 0; frame < totalFrames; frame++) {
        const t = (frame / totalFrames) * 8 * Math.PI;
        camera.orbit(t, orbitSpeed);
        if (slideSpeed) camera.slide(slideSpeed, t);

        const canvas = createCanvas(Number(opts.width), Number(opts.height));
        const ctx = canvas.getContext("2d");
        const result = slicer.renderFrame(ctx, mesh);

        const frameNum = String(frame).padStart(6, "0");
        const filename = `slice-${frameNum}.png`;
        fs.writeFileSync(path.join(opts.output, filename), canvas.toBuffer("image/png"));

        if (frame % 30 === 0 || frame === totalFrames - 1) {
          const pct = ((frame + 1) / totalFrames) * 100;
          process.stdout.write(
            `\r  Slicing: ${frame + 1}/${totalFrames} (${pct.toFixed(1)}%) verts:${result.clippedVertices ?? 0}`
          );
        }
      }

      process.stdout.write("\n");
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      console.log(`Rendered ${totalFrames} slice frames in ${elapsed}s`);
      console.log(`Output: ${path.resolve(opts.output)}`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ── Lattice command (voxel fields) ────────────────────────────────

program
  .command("lattice")
  .description("Render a 4D lattice/voxel field with marching cubes")
  .option("--fill <fn>", "Fill function: hypersphere, torus, gyroid, sphere-grid, noise, ridged, warped-gyroid", "gyroid")
  .option("--res <n>", "Lattice resolution per axis", "24")
  .option("--scale <n>", "Lattice physical scale", "4")
  .option("--isolevel <n>", "Isosurface threshold, or auto", "auto")
  .option("-w, --width <px>", "Output width", "1920")
  .option("--height <px>", "Output height", "1080")
  .option("-m, --mode <mode>", "Render mode: wireframe, solid, both", "wireframe")
  .option("-o, --output <dir>", "Output directory", "output")
  .option("--d3 <dist>", "3D camera distance", "4.0")
  .option("--scale-render <n>", "Pixel scale", "80")
  .option("--bg <color>", "Background color", "#0e1216")
  .option("--seed <n>", "Noise seed", "42")
  .option("--noise-scale <n>", "Noise frequency", "1.5")
  .option("--single", "Render a single frame")
  .option("-f, --frames <n>", "Number of frames", "120")
  .option("--fps <n>", "Frames per second", "30")
  .option("--orbit-speed <n>", "Rotation speed", "0.5")
  .option("--profile <name>", "Render profile: technical, cinematic, solid-copper, lattice", "lattice")
  .option("--no-normalize", "Keep lattice world-space dimensions")
  .option("--min-component-faces <n>", "Remove smaller disconnected components")
  .action(async (opts) => {
    try {
      const res = Number(opts.res);
      const scale = Number(opts.scale);
      const fillFn = opts.fill;

      console.log(`Creating ${res}^4 lattice...`);
      seedNoise(Number(opts.seed));
      const lattice = createLattice({
        resX: res, resY: res, resZ: res, resW: res,
        scaleX: scale, scaleY: scale, scaleZ: scale, scaleW: scale,
      });

      console.log(`Filling with ${fillFn}...`);
      let densityFn;
      switch (fillFn) {
        case "hypersphere":
          densityFn = hypersphereDensity(0, 0, 0, 0, 1.5);
          break;
        case "torus":
          densityFn = torus4dDensity(1.5, 0.5);
          break;
        case "gyroid":
          densityFn = gyroid4dDensity(Number(opts.noiseScale));
          break;
        case "sphere-grid":
          densityFn = sphereGrid4d(3, 0.3, 1.0);
          break;
        case "noise":
          densityFn = warp4d((x, y, z, w) =>
            fbm4d(x * Number(opts.noiseScale), y * Number(opts.noiseScale), z * Number(opts.noiseScale), w * Number(opts.noiseScale))
          , 0.4, 0.3);
          break;
        case "ridged":
          densityFn = (x, y, z, w) => {
            const s = Number(opts.noiseScale);
            let val = 0, amp = 1, freq = s;
            for (let o = 0; o < 5; o++) {
              let signal = Math.abs(noise4d(x * freq, y * freq, z * freq, w * freq));
              signal = 1 - signal;
              signal *= signal;
              val += amp * signal;
              amp *= 0.5;
              freq *= 2;
            }
            return val;
          };
          break;
        case "warped-gyroid":
          densityFn = warp4d(gyroid4dDensity(Number(opts.noiseScale)), 0.5, 0.3);
          break;
        default:
          throw new Error(`Unknown fill function: ${fillFn}`);
      }

      fillLattice(lattice, densityFn);
      const stats = latticeStats(lattice);
      console.log(`Lattice stats: min=${stats.min.toFixed(3)} max=${stats.max.toFixed(3)} mean=${stats.mean.toFixed(3)} fill=${(stats.fillRatio * 100).toFixed(1)}%`);

      const preset = latticePresets[fillFn] ?? latticePresets.gyroid;
      const isolevel = opts.isolevel === "auto" ? densityQuantile(lattice, preset.quantile) : Number(opts.isolevel);
      const diagnostics = latticeDiagnostics(lattice, isolevel);
      console.log(`Isolevel: ${isolevel.toFixed(4)} (${opts.isolevel === "auto" ? `auto q${preset.quantile}` : "manual"}), occupancy=${(diagnostics.occupancy * 100).toFixed(1)}%`);

      console.log("Extracting isosurface via marching cubes...");
      let mesh = marchingCubes4D(lattice, isolevel);
      mesh = weldMesh(mesh);
      mesh = filterMeshComponents(mesh, Number(opts.minComponentFaces ?? preset.minComponentFaces));
      if (opts.normalize !== false) mesh = normalizeMesh4D(mesh);
      console.log(`Mesh: ${mesh.vertices.length} vertices, ${mesh.faces.length} faces, ${mesh.edges.length} edges`);

      if (mesh.vertices.length === 0) {
        console.log("No geometry extracted — try adjusting --isolevel or --fill");
        process.exit(1);
      }

      // Render
      const w = Number(opts.width);
      const h = Number(opts.height);
      const orbitSpeed = Number(opts.orbitSpeed);
      const profile = getRenderProfile(opts.profile);

      fs.mkdirSync(path.resolve(opts.output), { recursive: true });

      if (opts.single) {
        const canvas = createCanvas(w, h);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = opts.bg;
        ctx.fillRect(0, 0, w, h);

        const rotate = cinematicRotation(0, { xw: 0.7, yz: 1.1, zw: 1.5, yw: 2.0 });
        const projected = mesh.vertices.map((v) => {
          const rotated = rotate(v);
          return project4Dto2D(rotated, w, h, 4.0, Number(opts.d3), Number(opts.scaleRender));
        });
        if (profile.scaleMode === "fit") applyFit(projected, fitTransform(projected, w, h, profile));
        const rotated4d = mesh.vertices.map((v) => rotate(v));

        if (opts.mode === "solid" || opts.mode === "both") {
          drawSolid(ctx, projected, mesh.faces, rotated4d, { ...profile, strokeEdges: opts.mode === "both" });
        }
        drawWireframe(ctx, projected, mesh.edges, { ...profile, lineWidth: profile.lineWidth ?? 0.8 });
        drawVertices(ctx, projected, profile);

        const outPath = path.resolve(opts.output, `lattice-${fillFn}-single.png`);
        fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
        console.log(`Lattice frame saved: ${outPath}`);
        return;
      }

      // Sequence
      const totalFrames = Number(opts.frames);
      const fps = Number(opts.fps);
      const startTime = performance.now();

      for (let frame = 0; frame < totalFrames; frame++) {
        const t = (frame / totalFrames) * 8 * Math.PI;
        const rotate = cinematicRotation(t, { xw: 0.7 * orbitSpeed, yz: 1.1 * orbitSpeed, zw: 1.5 * orbitSpeed, yw: 2.0 * orbitSpeed });

        const canvas = createCanvas(w, h);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = opts.bg;
        ctx.fillRect(0, 0, w, h);

        const projected = mesh.vertices.map((v) => {
          const rotated = rotate(v);
          return project4Dto2D(rotated, w, h, 4.0, Number(opts.d3), Number(opts.scaleRender));
        });
        if (profile.scaleMode === "fit") applyFit(projected, fitTransform(projected, w, h, profile));
        const rotated4d = mesh.vertices.map((v) => rotate(v));

        if (opts.mode === "solid" || opts.mode === "both") {
          drawSolid(ctx, projected, mesh.faces, rotated4d, { ...profile, strokeEdges: opts.mode === "both" });
        }
        drawWireframe(ctx, projected, mesh.edges, { ...profile, lineWidth: profile.lineWidth ?? 0.8 });
        drawVertices(ctx, projected, profile);

        const frameNum = String(frame).padStart(6, "0");
        fs.writeFileSync(path.join(opts.output, `lattice-${frameNum}.png`), canvas.toBuffer("image/png"));

        if (frame % 30 === 0 || frame === totalFrames - 1) {
          const pct = ((frame + 1) / totalFrames) * 100;
          process.stdout.write(`\r  Rendering: ${frame + 1}/${totalFrames} (${pct.toFixed(1)}%)`);
        }
      }

      process.stdout.write("\n");
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      console.log(`Rendered ${totalFrames} lattice frames in ${elapsed}s`);
      console.log(`Output: ${path.resolve(opts.output)}`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ── GPU raymarch command ─────────────────────────────────────────────

program
  .command("gpu")
  .description("GPU-accelerated 4D SDF raymarching and slicing")
  .option("--sdf <type>", "SDF type: hypersphere, torus, gyroid, torus3d, fbm, ridged", "gyroid")
  .option("--res-x <n>", "X resolution", "512")
  .option("--res-y <n>", "Y resolution", "512")
  .option("--res-z <n>", "Z resolution", "512")
  .option("--res-w <n>", "W resolution", "64")
  .option("--scale <n>", "Voxel scale", "1.5")
  .option("--isolevel <n>", "Isosurface threshold", "0.3")
  .option("--width <px>", "Output width", "1920")
  .option("--height <px>", "Output height", "1080")
  .option("--frames <n>", "Number of frames", "120")
  .option("--fps <n>", "Frames per second", "30")
  .option("-o, --output <dir>", "Output directory", "output")
  .option("--normal", "Visualize SDF normals", false)
  .option("--depth", "Visualize slice depth", false)
  .option("--orbit-speed <n>", "Camera rotation speed", "0.8")
  .option("--slide-speed <n>", "Hyperplane slide speed", "0.2")
  .action(async (opts) => {
    try {
      const { isWebGPUSupported } = await import("./gpu/WebGPURenderer.js");
      if (!isWebGPUSupported()) {
        console.error("Error: WebGPU not available. This browser/environment must support WebGPU for GPU rendering.");
        console.error("\nPrerequisites:");
        console.error("  Chrome/Edge 113+, Safari 17+, or Chromium-based browsers.");
        console.error("  Enable WebGPU via chrome://flags/#enable-webgpu");
        console.error("  This implementation uses the WebGPU API for GPU-accelerated 4D ray marching.\n");
        process.exit(1);
      }

      const { createWebGPURenderer } = await import("./gpu/WebGPURenderer.js");
      const camera = new (await import("./camera/Camera4D.js")).Camera4D({
        width: Number(opts.width),
        height: Number(opts.height),
        normal: {
          x: 0, y: 0, z: 0, w: 1
        },
        projectionMode: opts.depth ? "orthographic" : "perspective",
        d4: 4.0,
        d3: 4.0,
        scale: 80,
        durationSec: null,
      });

      const renderOpts = {
        width: Number(opts.width),
        height: Number(opts.height),
        maxSteps: 128,
        epsilon: 0.001,
        maxDistance: 100,
        sdfType: opts.sdf,
        sdfParams: {
          a: Number(opts.scale),
          b: 0.5,
          c: 1.0,
        },
        showNormals: opts.normal,
        showDepth: opts.depth,
        camera,
      };

      console.log(`Creating GPU 4D scene: ${opts.sdf}`);
      console.log(`Resolution: ${opts.resX}×${opts.resY}×${opts.resZ}×${opts.resW}`);
      console.log(`SDF parameters: scale=${opts.scale}, isolevel=${opts.isolevel}`);

      const renderer = await createWebGPURenderer(renderOpts);

      if (opts.frames === "1") {
        const t = 0;
        camera.orbit(t, Number(opts.orbitSpeed));
        camera.slide(Number(opts.slideSpeed), t);
        await renderer.renderFrame(t, null);
        console.log("Single frame rendered (output requires screenshot capture)");
        return;
      }

      await renderer.renderSequence(
        Number(opts.frames),
        opts.output,
        Number(opts.fps)
      );
    } catch (err) {
      console.error(`Error: ${err.message}`);
      if (err.stack) {
        console.error("Stack trace:", err.stack);
      }
      process.exit(1);
    }
  });

// ── Scene command (JSON scene runner) ─────────────────────────────────────────────

program
  .command("scene")
  .description("Run a scene from JSON (SDF tree, camera path, lighting)")
  .option("-f, --file <path>", "Scene JSON file", "scenes/gyroid.json")
  .option("-o, --output <dir>", "Output directory override")
  .action(async (opts) => {
    try {
      const { runScene } = await import("./scene/SceneRunner.js");
      const result = await runScene(opts.file, { output: opts.output });
      console.log(`Scene complete: ${result.frames} frames -> ${result.outputDir}`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    }
  });

program.parse();
