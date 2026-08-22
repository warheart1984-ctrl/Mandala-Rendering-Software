import { PhotorealRNG, V3, disneyBRDF, sampleDiffuse, sampleGGX, fresnelSchlick } from "../material/PhotorealUtils.js";
import { EnvironmentLighting } from "../lighting/EnvironmentLighting.js";
import { PhysicalCamera } from "../camera/PhysicalCamera.js";

/**
 * Path Tracer Integrator
 * CPU reference implementation - BIT_EXACT determinism
 */
export class PathIntegrator {
  constructor(config = {}) {
    this.maxDepth = config.maxDepth ?? 16;
    this.rrDepth = config.rrDepth ?? 4;
    this.spp = config.spp || 1;
    this.strategy = config.strategy || "path"; // "path", "bdpt"
    this.clampRadiance = config.clampRadiance ?? 1e4;
    this.rng = new PhotorealRNG(config.seed || 0x5EED4D00);
  }

  /**
   * Integrate a full frame
   */
  integrate(scene, camera, rng = this.rng) {
    const { width, height } = camera.imageWidth ? { width: camera.imageWidth, height: camera.imageHeight } : { width: 1280, height: 720 };
    const radiance = new Float32Array(width * height * 3);
    const aovs = {
      albedo: new Float32Array(width * height * 3),
      normal: new Float32Array(width * height * 3),
      depth: new Float32Array(width * height),
      motion: new Float32Array(width * height * 2),
      materialId: new Uint32Array(width * height),
      direct: new Float32Array(width * height * 3),
      indirect: new Float32Array(width * height * 3),
      emission: new Float32Array(width * height * 3)
    };

    const spp = this.spp;
    const totalSamples = width * height * spp;
    let sampleCount = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        let pixelRadiance = [0, 0, 0];
        let pixelDirect = [0, 0, 0];
        let pixelIndirect = [0, 0, 0];
        let pixelAlbedo = [0, 0, 0];
        let pixelNormal = [0, 0, 0];
        let pixelDepth = 0;
        let pixelMaterialId = 0;

        for (let s = 0; s < spp; s++) {
          const sampleRng = new PhotorealRNG(this.rng.nextInt(0xFFFFFFFF));
          const ray = camera.generateRaySimple(x, y, sampleRng);
          
          const result = this.trace(ray, scene, [1, 1, 1], sampleRng);
          
          pixelRadiance[0] += result.radiance[0];
          pixelRadiance[1] += result.radiance[1];
          pixelRadiance[2] += result.radiance[2];
          
          if (result.aovs) {
            pixelDirect[0] += result.aovs.direct[0];
            pixelDirect[1] += result.aovs.direct[1];
            pixelDirect[2] += result.aovs.direct[2];
            pixelIndirect[0] += result.aovs.indirect[0];
            pixelIndirect[1] += result.aovs.indirect[1];
            pixelIndirect[2] += result.aovs.indirect[2];
            pixelAlbedo[0] += result.aovs.albedo[0];
            pixelAlbedo[1] += result.aovs.albedo[1];
            pixelAlbedo[2] += result.aovs.albedo[2];
            pixelNormal[0] += result.aovs.normal[0];
            pixelNormal[1] += result.aovs.normal[1];
            pixelNormal[2] += result.aovs.normal[2];
            pixelDepth += result.aovs.depth;
            pixelMaterialId = result.aovs.materialId;
          }
        }

        const invSpp = 1 / spp;
        radiance[idx] = pixelRadiance[0] * invSpp;
        radiance[idx + 1] = pixelRadiance[1] * invSpp;
        radiance[idx + 2] = pixelRadiance[2] * invSpp;
        
        aovs.direct[idx] = pixelDirect[0] * invSpp;
        aovs.direct[idx + 1] = pixelDirect[1] * invSpp;
        aovs.direct[idx + 2] = pixelDirect[2] * invSpp;
        
        aovs.indirect[idx] = pixelIndirect[0] * invSpp;
        aovs.indirect[idx + 1] = pixelIndirect[1] * invSpp;
        aovs.indirect[idx + 2] = pixelIndirect[2] * invSpp;
        
        aovs.albedo[idx] = pixelAlbedo[0] * invSpp;
        aovs.albedo[idx + 1] = pixelAlbedo[1] * invSpp;
        aovs.albedo[idx + 2] = pixelAlbedo[2] * invSpp;
        
        aovs.normal[idx] = pixelNormal[0] * invSpp;
        aovs.normal[idx + 1] = pixelNormal[1] * invSpp;
        aovs.normal[idx + 2] = pixelNormal[2] * invSpp;
        
        aovs.depth[y * width + x] = pixelDepth / spp;
        aovs.materialId[y * width + x] = pixelMaterialId;
      }
    }

    return { radiance, aovs };
  }

  /**
   * Trace a single ray through the scene
   */
  trace(ray, scene, throughput, rng) {
    const result = {
      radiance: [0, 0, 0],
      aovs: {
        direct: [0, 0, 0],
        indirect: [0, 0, 0],
        albedo: [0, 0, 0],
        normal: [0, 0, 0],
        depth: 0,
        materialId: 0
      }
    };

    let currentRay = ray;
    let currentThroughput = throughput;
    let depth = 0;

    while (depth < this.maxDepth) {
      // Intersect ray with scene
      const hit = scene.intersect(currentRay);
      if (!hit) {
        // Environment lighting
        const envRadiance = scene.environment.evaluateRadiance(currentRay.direction, currentRay.origin, null);
        result.radiance = V3.add(result.radiance, V3.mulVec(currentThroughput, envRadiance));
        if (depth === 0) {
          result.aovs.emission = V3.add(result.aovs.emission, envRadiance);
        }
        break;
      }

      // Hit surface
      const { position, normal, materialId, uv, tangent, bitangent, objectId } = hit;
      
      // AOV capture at first hit
      if (depth === 0) {
        result.aovs.albedo = hit.material.albedo || [0.18, 0.18, 0.18];
        result.aovs.normal = hit.normal;
        result.aovs.depth = hit.distance;
        result.aovs.materialId = hit.materialId;
      }

      // Evaluate material
      const material = scene.getMaterial(materialId);
      const { f: bsdf, pdf: bsdfPdf } = material.evaluate(
        V3.negate(currentRay.direction), // wi (incoming)
        V3.normalize([0, 0, 0]), // wo - will be set per sample
        hit.normal, hit.tangent, hit.uv
      );

      // Direct lighting (NEE)
      const lightSample = scene.environment.sampleLight(hit.position, hit.normal, this.rng);
      if (lightSample.pdf > 0) {
        const { wi, radiance, pdf: lightPdf } = lightSample;
        const bsdfResult = hit.material.evaluate(lightSample.wi, V3.negate(currentRay.direction), hit.normal, hit.tangent, hit.uv);
        const bsdfVal = bsdfResult.f;
        const bsdfPdf = bsdfResult.pdf;
        
        const misWeight = this.misWeight(lightPdf, bsdfPdf);
        const directContrib = V3.mulVec(
          V3.mulVec(radiance, bsdfVal),
          Math.abs(V3.dot(hit.normal, lightSample.wi)) * misWeight / (lightPdf + 1e-6)
        );
        result.radiance = V3.add(result.radiance, V3.mulVec(currentThroughput, directContrib));
        result.aovs.direct = V3.add(result.aovs.direct, directContrib);
      }

      // Indirect sampling
      if (depth < this.maxDepth - 1) {
        const bsdfSample = hit.material.sample(
          V3.negate(currentRay.direction), 
          hit.normal, hit.tangent, hit.uv, this.rng
        );
        
        if (bsdfSample.pdf > 0) {
          // Russian roulette
          if (depth >= this.rrDepth) {
            const survivalProb = Math.min(0.95, Math.max(...bsdfSample.f));
            if (this.rng.nextFloat() > survivalProb) break;
            currentThroughput = V3.mulVec(currentThroughput, 1 / survivalProb);
          }

          currentThroughput = V3.mulVec(currentThroughput, V3.mulVec(bsdfSample.f, 1 / bsdfSample.pdf));
          currentRay = { origin: hit.position, direction: bsdfSample.wi };
          depth++;
          continue;
        }
      }

      break;
    }

    // Clamp radiance
    result.radiance = V3.clamp(result.radiance, [0, 0, 0], [this.clampRadiance, this.clampRadiance, this.clampRadiance]);
    
    return result;
  }

  misWeight(lightPdf, bsdfPdf) {
    const lp2 = lightPdf * lightPdf;
    const bp2 = bsdfPdf * bsdfPdf;
    return lp2 / (lp2 + bp2);
  }

  traceSingle(ray, scene, rng) {
    return this.trace(ray, scene, [1, 1, 1], rng);
  }
}

/**
 * Bidirectional Path Tracer (stub)
 */
export class BDPTIntegrator extends PathIntegrator {
  constructor(config = {}) {
    super({ ...config, strategy: "bdpt" });
    this.eyeDepth = config.eyeDepth ?? 5;
    this.lightDepth = config.lightDepth ?? 5;
  }
}

/**
 * Volumetric Path Tracer (stub)
 */
export class VolumetricIntegrator extends PathIntegrator {
  constructor(config = {}) {
    super({ ...config, strategy: "volumetric" });
    this.maxSteps = config.maxSteps ?? 64;
    this.stepSize = config.stepSize ?? 0.1;
  }
}

export { V3 } from "../material/PhotorealUtils.js";