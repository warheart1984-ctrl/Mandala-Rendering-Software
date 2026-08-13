import { PhotorealRNG } from "../material/PhotorealUtils.js";
import { HosekWilkieSky, PreethamSky } from "./SkyModel.js";
import { V3 } from "../material/PhotorealUtils.js";

/**
 * Analytic Light base class
 */
export class AnalyticLight {
  constructor(definition = {}) {
    this.type = definition.type || "point";
    this.color = definition.color || [1, 1, 1];
    this.intensity = definition.intensity || 1.0;
    this.position = definition.position || [0, 0, 0];
    this.direction = definition.direction ? V3.normalize(definition.direction) : [0, -1, 0];
    this.angle = definition.angle || Math.PI / 4; // for spot
    this.falloff = definition.falloff ?? 2; // inverse square
    this.area = definition.area || 0; // for area lights
    this.lightId = definition.lightId || `light_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  evaluate(wi, hitPoint) {
    // Returns { radiance, pdf, lightId }
    return { radiance: [0, 0, 0], pdf: 0, lightId: this.lightId };
  }

  sample(hitPoint, rng) {
    // Returns { wi, radiance, pdf, lightId }
    return { wi: [0, 0, 0], radiance: [0, 0, 0], pdf: 0, lightId: this.lightId };
  }

  pdf(wi, hitPoint) {
    return 0;
  }
}

/**
 * Point Light
 */
export class PointLight extends AnalyticLight {
  constructor(definition = {}) {
    super({ ...definition, type: "point" });
  }

  evaluate(wi, hitPoint) {
    const toLight = V3.sub(this.position, hitPoint);
    const dist = V3.length(toLight);
    const dir = V3.div(toLight, dist);
    
    if (V3.dot(wi, this.direction) < 0.999) return { radiance: [0, 0, 0], pdf: 0, lightId: this.lightId };
    
    const falloff = 1 / (dist * dist * this.falloff);
    const radiance = V3.mulVec(this.color, this.intensity * falloff);
    
    return { radiance, pdf: 1, lightId: this.lightId };
  }

  sample(hitPoint, rng) {
    const toLight = V3.sub(this.position, hitPoint);
    const dist = V3.length(toLight);
    const dir = V3.div(toLight, dist);
    const falloff = 1 / (dist * dist * this.falloff);
    const radiance = V3.mulVec(this.color, this.intensity * falloff);
    
    return { wi: dir, radiance, pdf: 1, lightId: this.lightId };
  }
}

/**
 * Directional Light (Sun)
 */
export class DirectionalLight extends AnalyticLight {
  constructor(definition = {}) {
    super({ ...definition, type: "directional" });
    this.direction = V3.normalize(definition.direction || [0, -1, 0]);
  }

  evaluate(wi, hitPoint) {
    if (V3.dot(wi, this.direction) < 0.9999) return { radiance: [0, 0, 0], pdf: 0, lightId: this.lightId };
    return { radiance: V3.mulVec(this.color, this.intensity), pdf: 1, lightId: this.lightId };
  }

  sample(hitPoint, rng) {
    return { wi: V3.negate(this.direction), radiance: V3.mulVec(this.color, this.intensity), pdf: 1, lightId: this.lightId };
  }
}

/**
 * Spot Light
 */
export class SpotLight extends AnalyticLight {
  constructor(definition = {}) {
    super({ ...definition, type: "spot" });
    this.direction = V3.normalize(definition.direction || [0, -1, 0]);
    this.angle = definition.angle || Math.PI / 6;
    this.penumbra = definition.penumbra || 0.1;
  }

  evaluate(wi, hitPoint) {
    const cosAngle = V3.dot(wi, V3.negate(this.direction));
    const cosAngleMax = Math.cos(this.angle);
    const cosAngleMin = Math.cos(this.angle + this.penumbra);
    
    if (cosAngle < cosAngleMin) return { radiance: [0, 0, 0], pdf: 0, lightId: this.lightId };
    
    const falloff = (cosAngle - cosAngleMin) / (cosAngleMax - cosAngleMin);
    const smooth = falloff * falloff * (3 - 2 * falloff); // smoothstep
    
    return { 
      radiance: V3.mulVec(this.color, this.intensity * smooth), 
      pdf: 1, 
      lightId: this.lightId 
    };
  }
}

/**
 * Area Light (Rectangle)
 */
export class AreaLight extends AnalyticLight {
  constructor(definition = {}) {
    super({ ...definition, type: "area" });
    this.width = definition.width || 1;
    this.height = definition.height || 1;
    this.normal = V3.normalize(definition.normal || [0, -1, 0]);
    this.tangent = definition.tangent ? V3.normalize(definition.tangent) : [1, 0, 0];
    this.bitangent = V3.cross(this.normal, this.tangent);
  }

  evaluate(wi, hitPoint) {
    // Check if ray hits area light
    const toLight = V3.sub(
      V3.add(this.position, V3.add(V3.mul(this.tangent, 0), V3.mul(this.bitangent, 0))),
      hitPoint
    );
    const dist = V3.length(toLight);
    const dir = V3.div(toLight, dist);
    
    if (V3.dot(dir, this.normal) >= 0) return { radiance: [0, 0, 0], pdf: 0, lightId: this.lightId };
    
    // Check if within rectangle bounds (simplified)
    return { 
      radiance: V3.mulVec(this.color, this.intensity), 
      pdf: 1 / (this.width * this.height), 
      lightId: this.lightId 
    };
  }

  sample(hitPoint, rng) {
    const u = rng.nextFloat() - 0.5;
    const v = rng.nextFloat() - 0.5;
    const point = V3.add(this.position, V3.add(V3.mul(this.tangent, u * this.width), V3.mul(this.bitangent, v * this.height)));
    
    const toLight = V3.sub(point, hitPoint);
    const dist = V3.length(toLight);
    const dir = V3.div(toLight, dist);
    
    if (V3.dot(dir, this.normal) >= 0) return { wi: [0, 0, 0], radiance: [0, 0, 0], pdf: 0, lightId: this.lightId };
    
    const area = this.width * this.height;
    const cos = Math.abs(V3.dot(V3.div(toLight, dist), this.normal));
    const pdf = (dist * dist) / (area * cos);
    
    return { 
      wi: dir, 
      radiance: V3.mulVec(this.color, this.intensity), 
      pdf, 
      lightId: this.lightId 
    };
  }
}

/**
 * Environment Lighting - HDR + Sky + Analytic
 */
export class EnvironmentLighting {
  constructor(config = {}) {
    this.rng = new PhotorealRNG(config.seed || 0x5EED4D00);
    
    // Sky model
    this.skyModel = config.skyModel 
      ? new (config.skyModel === "preetham" ? PreethamSky : HosekWilkieSky)(config.skyParams)
      : new HosekWilkieSky(config.skyParams);
    
    // Environment map (optional HDR)
    this.envMap = config.envMap || null; // { data: Float32Array, width, height }
    this.envMapIntensity = config.envMapIntensity || 1.0;
    this.envMapRotation = config.envMapRotation || 0;
    
    // Analytic lights
    this.lights = [];
    if (config.lights) {
      config.lights.forEach(l => this.addLight(l));
    }
    
    // Sun from 4D worldline
    this.sunWorldline = config.sunWorldline || null;
  }

  addLight(lightDef) {
    let light;
    switch (lightDef.type) {
      case "point": light = new PointLight(lightDef); break;
      case "directional": light = new DirectionalLight(lightDef); break;
      case "spot": light = new SpotLight(lightDef); break;
      case "area": light = new AreaLight(lightDef); break;
      default: return;
    }
    this.lights.push(light);
    return light;
  }

  removeLight(lightId) {
    this.lights = this.lights.filter(l => l.lightId !== lightId);
  }

  getLight(lightId) {
    return this.lights.find(l => l.lightId === lightId);
  }

  // Update sun from 4D worldline
  updateSunFromWorldline(worldlineTime) {
    if (this.sunWorldline) {
      const sunPos = this.sunWorldline.getSunPosition(worldlineTime);
      if (sunPos) {
        this.skyModel.setSunDirection(sunPos);
        // Update directional light
        let sunLight = this.lights.find(l => l.type === "directional");
        if (!sunLight) {
          sunLight = new DirectionalLight({ 
            color: [1, 0.9, 0.8], 
            intensity: 100000,
            direction: sunPos 
          });
          this.lights.push(sunLight);
        } else {
          sunLight.direction = sunPos;
        }
      }
    }
  }

  // Evaluate total radiance from all sources
  evaluateRadiance(wi, hitPoint, normal) {
    let totalRadiance = [0, 0, 0];
    
    // Sky
    const skyRadiance = this.skyModel.evaluate(wi);
    totalRadiance = V3.add(totalRadiance, skyRadiance);
    
    // Environment map
    if (this.envMap) {
      const envRadiance = this.sampleEnvMap(wi);
      totalRadiance = V3.add(totalRadiance, V3.mulVec(envRadiance, this.envMapIntensity));
    }
    
    // Analytic lights
    for (const light of this.lights) {
      const lightResult = light.evaluate(wi, hitPoint);
      totalRadiance = V3.add(totalRadiance, lightResult.radiance);
    }
    
    return totalRadiance;
  }

  // Sample a light source (for direct lighting)
  sampleLight(hitPoint, normal, rng) {
    // Strategy: sample light with probability proportional to expected contribution
    const light = this.selectLight(rng);
    if (!light) return { wi: [0,0,0], radiance: [0,0,0], pdf: 0, lightId: null };
    
    const result = light.sample(hitPoint, rng);
    return result;
  }

  selectLight(rng) {
    if (this.lights.length === 0) return null;
    // Weighted by intensity (simplified)
    const totalIntensity = this.lights.reduce((sum, l) => sum + l.intensity, 0);
    const target = rng.nextFloat() * totalIntensity;
    let sum = 0;
    for (const light of this.lights) {
      sum += light.intensity;
      if (sum >= target) return light;
    }
    return this.lights[this.lights.length - 1];
  }

  // Environment map sampling
  sampleEnvMap(dir) {
    if (!this.envMap) return [0, 0, 0];
    // Convert direction to spherical coordinates
    const phi = Math.atan2(dir[2], dir[0]);
    const theta = Math.acos(Math.max(-1, Math.min(1, dir[1])));
    
    const u = (phi + Math.PI) / (2 * Math.PI);
    const v = theta / Math.PI;
    
    const w = this.envMap.width;
    const h = this.envMap.height;
    const x = Math.min(w - 1, Math.floor(u * w));
    const y = Math.min(h - 1, Math.floor(v * h));
    const idx = (y * w + x) * 3;
    
    return [
      this.envMap.data[idx] / 255,
      this.envMap.data[idx + 1] / 255,
      this.envMap.data[idx + 2] / 255
    ];
  }

  // Sample environment map (importance sampling)
  sampleEnvMapImportance(rng) {
    if (!this.envMap) return { dir: [0, 1, 0], pdf: 1 };
    
    // Use precomputed CDF for importance sampling
    // For now, uniform sampling
    return this.skyModel.sample(rng);
  }

  // Evaluate direct lighting for a hit point
  evaluateDirect(hitPoint, normal, rng) {
    const light = this.selectLight(this.rng);
    if (!light) return { radiance: [0, 0, 0], wi: [0, 0, 0], pdf: 0 };
    
    return light.sample(hitPoint, rng);
  }

  // Multiple importance sampling for direct lighting
  misWeight(lightPdf, bsdfPdf) {
    return (lightPdf * lightPdf) / (lightPdf * lightPdf + bsdfPdf * bsdfPdf);
  }
}

export { PhotorealRNG, V3, fresnelSchlick, ggxNDF, smithGGX } from "../material/PhotorealUtils.js";
export { HosekWilkieSky, PreethamSky } from "./SkyModel.js";