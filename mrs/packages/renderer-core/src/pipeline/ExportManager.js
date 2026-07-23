/**
 * Export Manager for 4D Renderer
 * Supports GLTF, OBJ, PNG sequences, and MP4 export
 */

import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import { CanvasRenderer } from "../render/canvas-renderer.js";
import { getSurface, sampleSurface } from "../surfaces/index.js";
import { createScene } from "./scene.js";
import { TimelinePlayer } from "../timeline/TimelinePlayer.js";

export class ExportManager {
  constructor(options = {}) {
    this.outputDir = options.outputDir ?? "output";
    this.defaultFormat = options.defaultFormat ?? "png";
  }
  
  /**
   * Export a single frame to PNG
   */
  async exportPNG(mesh, scene, frameIndex, outputPath) {
    const canvas = createCanvas(scene.width, scene.height);
    const renderer = new CanvasRenderer(canvas, scene);
    
    const t = (frameIndex / scene.frames) * (scene.durationSec ?? scene.frames / scene.fps) * 2 * Math.PI;
    renderer.renderFrame(mesh, t);
    
    const buffer = canvas.toBuffer("image/png");
    
    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, buffer);
    }
    
    return buffer;
  }
  
  /**
   * Export a sequence of PNG frames
   */
  async exportPNGSequence(scene, onProgress = null) {
    const surface = getSurface(scene.surface);
    const mesh = sampleSurface(surface, scene.resolution);
    const outputDir = path.resolve(scene.outputDir ?? this.outputDir);
    
    fs.mkdirSync(outputDir, { recursive: true });
    
    const frames = [];
    const startTime = performance.now();
    
    for (let frame = 0; frame < scene.frames; frame++) {
      const frameNum = String(frame).padStart(6, "0");
      const filename = `${scene.outputPrefix ?? "frame"}-${frameNum}.png`;
      const outputPath = path.join(outputDir, filename);
      
      await this.exportPNG(mesh, scene, frame, outputPath);
      frames.push(outputPath);
      
      if (onProgress) {
        onProgress(frame + 1, scene.frames, outputPath);
      }
    }
    
    const elapsed = (performance.now() - startTime) / 1000;
    
    return {
      frames,
      outputDir,
      frameCount: scene.frames,
      elapsed,
    };
  }
  
  /**
   * Export a PNG sequence driven by a timeline
   */
  async exportTimelinePNGSequence(timeline, scene, renderPipeline, onProgress = null) {
    const player = new TimelinePlayer(timeline);
    player.loop = false;
    const totalFrames = Math.floor(timeline.duration * (scene.fps ?? 30));
    const outputDir = path.resolve(scene.outputDir ?? this.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });

    const frames = [];
    const startTime = performance.now();

    for (let frame = 0; frame < totalFrames; frame++) {
      const t = frame / (scene.fps ?? 30);
      const result = await renderPipeline.renderFrame(t, scene);
      const frameNum = String(frame).padStart(6, "0");
      const filename = `${scene.outputPrefix ?? "timeline"}-${frameNum}.png`;
      const outputPath = path.join(outputDir, filename);
      frames.push(outputPath);

      if (onProgress) onProgress(frame + 1, totalFrames, outputPath);
    }

    const elapsed = (performance.now() - startTime) / 1000;
    return { frames, outputDir, frameCount: totalFrames, elapsed };
  }

  /**
   * Export a movie driven by a timeline
   */
  async exportTimelineMovie(timeline, scene, renderPipeline, onProgress = null) {
    const { frames, outputDir } = await this.exportTimelinePNGSequence(timeline, scene, renderPipeline, onProgress);
    const mp4Path = path.resolve(scene.outputPath ?? "output.mp4");
    const { encodeVideo } = await import("./movie-pipeline.js");
    const result = encodeVideo(outputDir, mp4Path, scene.fps ?? 30, scene.outputPrefix ?? "timeline", scene.codec ?? "libx264");
    return { videoPath: result.outputPath, size: result.size, frameCount: frames.length };
  }

  /**
   * Export to GLTF 2.0 format
   */
  async exportGLTF(mesh, scene, outputPath) {
    const gltf = this.buildGLTF(mesh, scene);
    
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    
    // Write GLTF JSON
    const gltfPath = outputPath.replace(/\.(gltf|glb)$/i, ".gltf");
    fs.writeFileSync(gltfPath, JSON.stringify(gltf, null, 2));
    
    // Write binary buffer if present
    if (gltf.buffers && gltf.buffers[0].uri) {
      const bufferPath = path.join(path.dirname(gltfPath), gltf.buffers[0].uri);
      fs.writeFileSync(bufferPath, Buffer.from(gltf.buffers[0].data));
    }
    
    return gltfPath;
  }
  
  buildGLTF(mesh, scene) {
    // Convert 4D vertices to 3D (project w to color or ignore)
    const positions = [];
    const normals = [];
    const colors = [];
    
    for (const v of mesh.vertices) {
      // Project 4D to 3D for GLTF
      positions.push(v.x, v.y, v.z);
      
      // Use w coordinate for coloring
      const wNormalized = (v.w + 1) / 2; // Normalize to 0-1
      colors.push(wNormalized, 0.5, 1 - wNormalized, 1.0);
      
      // Simple normal estimation
      normals.push(0, 0, 1);
    }
    
    // Build indices from faces
    const indices = [];
    for (const face of mesh.faces) {
      indices.push(face[0], face[1], face[2]);
    }
    
    // Create binary buffer
    const positionData = new Float32Array(positions);
    const normalData = new Float32Array(normals);
    const colorData = new Float32Array(colors);
    const indexData = new Uint16Array(indices);
    
    const bufferData = Buffer.concat([
      Buffer.from(positionData.buffer),
      Buffer.from(normalData.buffer),
      Buffer.from(colorData.buffer),
      Buffer.from(indexData.buffer),
    ]);
    
    const bufferUri = "mesh.bin";
    
    const gltf = {
      asset: {
        version: "2.0",
        generator: "4D Renderer",
      },
      buffers: [
        {
          uri: bufferUri,
          byteLength: bufferData.length,
          data: bufferData,
        },
      ],
      bufferViews: [
        {
          buffer: 0,
          byteOffset: 0,
          byteLength: positionData.buffer.byteLength,
          target: 34962, // ARRAY_BUFFER
        },
        {
          buffer: 0,
          byteOffset: positionData.buffer.byteLength,
          byteLength: normalData.buffer.byteLength,
          target: 34962,
        },
        {
          buffer: 0,
          byteOffset: positionData.buffer.byteLength + normalData.buffer.byteLength,
          byteLength: colorData.buffer.byteLength,
          target: 34962,
        },
        {
          buffer: 0,
          byteOffset: positionData.buffer.byteLength + normalData.buffer.byteLength + colorData.buffer.byteLength,
          byteLength: indexData.buffer.byteLength,
          target: 34963, // ELEMENT_ARRAY_BUFFER
        },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126, // FLOAT
          count: positions.length / 3,
          type: "VEC3",
        },
        {
          bufferView: 1,
          componentType: 5126,
          count: normals.length / 3,
          type: "VEC3",
        },
        {
          bufferView: 2,
          componentType: 5126,
          count: colors.length / 4,
          type: "VEC4",
        },
        {
          bufferView: 3,
          componentType: 5123, // UNSIGNED_SHORT
          count: indices.length,
          type: "SCALAR",
        },
      ],
      meshes: [
        {
          primitives: [
            {
              attributes: {
                POSITION: 0,
                NORMAL: 1,
                COLOR_0: 2,
              },
              indices: 3,
              mode: 4, // TRIANGLES
            },
          ],
        },
      ],
      nodes: [
        {
          mesh: 0,
          name: scene.surface ?? "4D Surface",
        },
      ],
      scenes: [
        {
          nodes: [0],
        },
      ],
    };
    
    return gltf;
  }
  
  /**
   * Export to OBJ format
   */
  async exportOBJ(mesh, scene, outputPath) {
    let obj = "# 4D Surface Export\n";
    obj += `# Surface: ${scene.surface ?? "Unknown"}\n`;
    obj += `# Generated by 4D Renderer\n\n`;
    
    // Export vertices (4D -> 3D projection)
    for (const v of mesh.vertices) {
      obj += `v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}\n`;
      // Store w as vertex color in comment
      obj += `# w: ${v.w.toFixed(6)}\n`;
    }
    
    // Export faces
    for (const face of mesh.faces) {
      obj += `f ${face[0] + 1} ${face[1] + 1} ${face[2] + 1}\n`;
    }
    
    // Export edges as lines
    if (mesh.edges) {
      obj += "\n# Edges\n";
      for (const edge of mesh.edges) {
        obj += `l ${edge[0] + 1} ${edge[1] + 1}\n`;
      }
    }
    
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, obj);
    
    return outputPath;
  }
  
  /**
   * Export to STL format (for 3D printing)
   */
  async exportSTL(mesh, scene, outputPath) {
    // STL only supports triangles, so we use faces
    const triangles = mesh.faces || [];
    
    // Calculate normals for each triangle
    const calculateNormal = (v1, v2, v3) => {
      const edge1 = { x: v2.x - v1.x, y: v2.y - v1.y, z: v2.z - v1.z };
      const edge2 = { x: v3.x - v1.x, y: v3.y - v1.y, z: v3.z - v1.z };
      const normal = {
        x: edge1.y * edge2.z - edge1.z * edge2.y,
        y: edge1.z * edge2.x - edge1.x * edge2.z,
        z: edge1.x * edge2.y - edge1.y * edge2.x,
      };
      const len = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
      return { x: normal.x / len, y: normal.y / len, z: normal.z / len };
    };
    
    // Binary STL header (80 bytes) + triangle count (4 bytes)
    const header = Buffer.alloc(80, 0);
    const triangleCount = Buffer.alloc(4);
    triangleCount.writeUInt32LE(triangles.length);
    
    // Each triangle: normal (12 bytes) + vertices (36 bytes) + attribute (2 bytes) = 50 bytes
    const triangleData = Buffer.alloc(triangles.length * 50);
    let offset = 0;
    
    for (const face of triangles) {
      const v1 = mesh.vertices[face[0]];
      const v2 = mesh.vertices[face[1]];
      const v3 = mesh.vertices[face[2]];
      
      const normal = calculateNormal(v1, v2, v3);
      
      // Write normal
      triangleData.writeFloatLE(normal.x, offset);
      triangleData.writeFloatLE(normal.y, offset + 4);
      triangleData.writeFloatLE(normal.z, offset + 8);
      offset += 12;
      
      // Write vertices
      triangleData.writeFloatLE(v1.x, offset);
      triangleData.writeFloatLE(v1.y, offset + 4);
      triangleData.writeFloatLE(v1.z, offset + 8);
      offset += 12;
      
      triangleData.writeFloatLE(v2.x, offset);
      triangleData.writeFloatLE(v2.y, offset + 4);
      triangleData.writeFloatLE(v2.z, offset + 8);
      offset += 12;
      
      triangleData.writeFloatLE(v3.x, offset);
      triangleData.writeFloatLE(v3.y, offset + 4);
      triangleData.writeFloatLE(v3.z, offset + 8);
      offset += 12;
      
      // Attribute (unused)
      triangleData.writeUInt16LE(0, offset);
      offset += 2;
    }
    
    const stlBuffer = Buffer.concat([header, triangleCount, triangleData]);
    
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, stlBuffer);
    
    return outputPath;
  }
  
  /**
   * Export to MP4 using FFmpeg
   */
  async exportMP4(scene, outputPath, onProgress = null) {
    const { frames, outputDir } = await this.exportPNGSequence(scene, onProgress);
    
    // Use existing FFmpeg encoding from movie-pipeline
    const { encodeVideo } = await import("./movie-pipeline.js");
    
    const mp4Path = path.resolve(outputPath);
    const result = encodeVideo(outputDir, mp4Path, scene.fps, scene.outputPrefix ?? "frame", scene.codec ?? "libx264");
    
    return {
      videoPath: result.outputPath,
      size: result.size,
      frameCount: frames.length,
    };
  }
  
  /**
   * Export to multiple formats
   */
  async exportMultiple(mesh, scene, formats, onProgress = null) {
    const results = {};
    
    for (const format of formats) {
      const outputPath = path.join(
        scene.outputDir ?? this.outputDir,
        `${scene.surface ?? "surface"}.${format}`
      );
      
      switch (format.toLowerCase()) {
        case "png":
        case "png-sequence":
          results.png = await this.exportPNGSequence(scene, onProgress);
          break;
        case "gltf":
          results.gltf = await this.exportGLTF(mesh, scene, outputPath);
          break;
        case "obj":
          results.obj = await this.exportOBJ(mesh, scene, outputPath);
          break;
        case "stl":
          results.stl = await this.exportSTL(mesh, scene, outputPath);
          break;
        case "mp4":
          results.mp4 = await this.exportMP4(scene, outputPath, onProgress);
          break;
        default:
          console.warn(`Unknown export format: ${format}`);
      }
    }
    
    return results;
  }
  
  /**
   * Export with automatic format detection from filename
   */
  async exportAuto(mesh, scene, outputPath, onProgress = null) {
    const ext = path.extname(outputPath).toLowerCase().slice(1);
    
    switch (ext) {
      case "png":
        return await this.exportPNG(mesh, scene, 0, outputPath);
      case "gltf":
        return await this.exportGLTF(mesh, scene, outputPath);
      case "obj":
        return await this.exportOBJ(mesh, scene, outputPath);
      case "stl":
        return await this.exportSTL(mesh, scene, outputPath);
      case "mp4":
        return await this.exportMP4(scene, outputPath, onProgress);
      default:
        throw new Error(`Unknown export format: ${ext}`);
    }
  }
}

export function createExportManager(options = {}) {
  return new ExportManager(options);
}

/**
 * Convenience function to export a surface to multiple formats
 */
export async function exportSurface(surfaceId, formats, options = {}) {
  const scene = createScene({ surface: surfaceId, ...options });
  const surface = getSurface(surfaceId);
  const mesh = sampleSurface(surface, scene.resolution);
  
  const exporter = createExportManager({ outputDir: options.outputDir });
  return await exporter.exportMultiple(mesh, scene, formats, options.onProgress);
}
