// ============================================================
// Axiom-X Minimal JS Path Tracer
// Deterministic given seed - matches C++ Mulberry32 PRNG
// ============================================================

// Mulberry32 PRNG - same algorithm as C++ axiom_math.cpp
// State is kept per-tile for deterministic behavior
function Mulberry32(initialState) {
  let state = initialState >>> 0; // unsigned 32-bit
  
  this.next = function() {
    state = state + 0x6D2B79F5;
    let z = state;
    z = (z ^ (z >> 15)) * 0x1;  // note: C++ has * 0x1 which is no-op, keeping for spec compliance
    z = (z ^ (z >> 7)) * 0x61;
    return z ^ (z >> 14);
  };
  
  this.float = function() {
    return this.next() / 4294967296.0; // 2^32
  };
}

// Vec4 operations
function Vec4(x, y, z, w) {
  this.x = x || 0;
  this.y = y || 0;
  this.z = z || 0;
  this.w = w || 0;
}

// Vec4 instance methods
Vec4.prototype.add = function(b) {
  return new Vec4(this.x + b.x, this.y + b.y, this.z + b.z, this.w + b.w);
};

Vec4.prototype.sub = function(b) {
  return new Vec4(this.x - b.x, this.y - b.y, this.z - b.z, this.w - b.w);
};

Vec4.prototype.mul = function(s) {
  return new Vec4(this.x * s, this.y * s, this.z * s, this.w * s);
};

Vec4.prototype.div = function(s) {
  return new Vec4(this.x / s, this.y / s, this.z / s, this.w / s);
};

Vec4.prototype.lerp = function(b, t) {
  return new Vec4(this.x + (b.x - this.x) * t, this.y + (b.y - this.y) * t,
                  this.z + (b.z - this.z) * t, this.w + (this.w - this.w) * t);
};

Vec4.prototype.normalize = function() {
  const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
  return len > 0 ? new Vec4(this.x / len, this.y / len, this.z / len, this.w / len) : new Vec4(this.x, this.y, this.z, this.w);
};

Vec4.prototype.max = function(b) {
  return new Vec4(Math.max(this.x, b.x), Math.max(this.y, b.y),
                  Math.max(this.z, b.z), Math.max(this.w, b.w));
};

Vec4.prototype.min = function(b) {
  return new Vec4(Math.min(this.x, b.x), Math.min(this.y, b.y),
                  Math.min(this.z, b.z), Math.min(this.w, b.w));
};

Vec4.add = function(a, b) {
  return new Vec4(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w);
};

Vec4.sub = function(a, b) {
  return new Vec4(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w);
};

Vec4.mul = function(a, s) {
  return new Vec4(a.x * s, a.y * s, a.z * s, a.w * s);
};

Vec4.mul2 = function(a, b) {
  return new Vec4(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w);
};

Vec4.div = function(a, s) {
  return new Vec4(a.x / s, a.y / s, a.z / s, a.w / s);
};

Vec4.lerp = function(a, b, t) {
  return new Vec4(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 
                  a.z + (b.z - a.z) * t, a.w + (w - a.w) * t);
};

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

function length2(v) {
  return dot(v, v);
}

function length(v) {
  return Math.sqrt(length2(v));
}

function normalize(v) {
  const len = length(v);
  return len > 0 ? Vec4.div(v, len) : v;
}

// ============================================================
// Scene constants
// ============================================================

// Floor plane: y = 0
const FLOOR_Y = 0.0;

// Sphere at origin, radius 1
const SPHERE_R = 1.0;

// Light: infinite distant light from direction
const LIGHT_DIR = new Vec4(0.5, 1.0, 0.8, 0); // w=0 for direction
const LIGHT_INTENSITY = 5.0;

// Camera parameters
const CAMERA_POS = new Vec4(0, 1.5, -3, 1);
const CAMERA_UP = new Vec4(0, 1, 0, 0);

// ============================================================
// Path Tracing Kernel
// ============================================================

/**
 * Render a pixel using path tracing with Russian roulette.
 * Deterministic given the initial PRNG state (seed).
 * 
 * @param {number} px Pixel x coordinate
 * @param {number} py Pixel y coordinate  
 * @param {number} width Image width
 * @param {number} height Image height
 * @param {Mulberry32} rng PRNG instance (initialized with seed)
 * @param {number} maxDepth Maximum bounce depth
 * @returns {Vec4} RGBA color (float32, unclamped before tonemapping)
 */
function tracePixel(px, py, width, height, rng, maxDepth = 5) {
  // Camera ray generation
  // Simple perspective camera with vertical FOV ~52 degrees
  const fov = 52 * Math.PI / 180;
  const aspect = width / height;
  
  // Normalized device coordinates (-1 to 1)
  const ndcX = (2 * (px + 0.5) / width) - 1;
  const ndcY = (2 * (py + 0.5) / height) - 1;
  
  // Scale by FOV and aspect
  const rayDir = new Vec4(
    ndcX * Math.tan(fov / 2) * aspect,
    ndcY * Math.tan(fov / 2),
    -1,  // looking down -z
    0
  );
  
  // Normalize
  let rayDirNorm = normalize(rayDir);
  
  // Path trace
  let color = new Vec4(0, 0, 0, 0);
  let throughput = new Vec4(1, 1, 1, 1);
  const rayOrigin = CAMERA_POS;
  
  for (let depth = 0; depth < maxDepth; depth++) {
    // Scene intersection
    const hit = sceneIntersect(rayOrigin, rayDirNorm, rng);
    
    if (!hit.hit) {
      // Sky color - simple gradient
      const t = 0.5 * (rayDirNorm.y + 1.0);
      const sky = new Vec4(0.5, 0.7, 1.0, 1).mul(1 - t).add(new Vec4(0.8, 0.8, 0.9, 1) * t);
      color = color.add(Vec4.mul(throughput, sky));
      break;
    }
    
    // Compute shading at hit point
    const hitPos = Vec4.add(rayOrigin, Vec4.mul(rayDirNorm, hit.t));
    const normal = normalize(hit.normal);
    const material = hit.material;
    
    // Direct lighting
    let directColor = new Vec4(0, 0, 0, 0);
    
    // Sample light
    const lightDir = Vec4.sub(LIGHT_DIR, normal.mul(0)); // direction light
    const lightNormal = normalize(lightDir);
    
    // Cosine term
    const NdotL = Math.max(dot(normal, lightNormal), 0);
    
    // BRDF: GGX normalized
    const roughness = material.roughness;
    const a = roughness * roughness;
    const NdotH = Math.max(dot(normal, lightDir.normalize()), 0);
    const NdotH2 = NdotH * NdotH;
    const NdotH4 = NdotH2 * NdotH2;
    const a2 = a * a;
    const denominator = NdotH4 + a2 * (1 - NdotH2);
    const ggx = a2 / (Math.PI * denominator);
    
    // Geometry term (Schlick-GGX approximate)
    const G = NdotL; // simplified
    
    // Fresnel (Schlick approx)
    const F0 = new Vec4(0.04, 0.04, 0.04, 1);
    const F = F0.add(F0.mul(3 - 3 * NdotL)); // F = F0 + (1-F0)*(1-cosθ)^3
    
    const specular = Vec4.mul(F, ggx / NdotL); // simplified geometry+fresnel
    
    // Diffuse component (3ρ/4π for energy conservation)
    const rho = new Vec4(material.albedo.r, material.albedo.g, material.albedo.b, 1);
    const diffuse = rho.mul(3.0 / Math.PI);
    
    // Combine diffuse + specular for direct lighting
    const directContribution = diffuse.mul(NdotL).add(specular.mul(NdotL));
    directColor = directColor.add(Vec4.mul(throughput, directContribution.mul(LIGHT_INTENSITY * NdotL)));
    
    // Russian roulette: continue path or terminate
    const rrProbability = Math.max(diffuse.x, Math.max(diffuse.y, diffuse.z));
    if (rrProbability < 0.1 && depth > 2) {
      // Terminate with probability
      const ξ = rng.float();
      if (ξ < 0.1) break;
      // Rescale throughput
      throughput = Vec4.mul(throughput, new Vec4(1/rrProbability, 1/rrProbability, 1/rrProbability, 1));
    }
    
    // Sample next ray direction
    // For simplicity, reflect around normal or sample GGX
    const ξ1 = rng.float();
    const ξ2 = rng.float();
    const ξ3 = rng.float();
    
    // Sample hemisphere with GGX distribution
    const sampleA = 1.0;
    const b = roughness;
    
    const phi = 2 * Math.PI * ξ1;
    const cosTheta = Math.pow(1 - ξ2, 1 / (a * b + 1)); // simplified
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    
    const x = Math.cos(phi) * sinTheta;
    const y = Math.sin(phi) * sinTheta;
    const z = cosTheta;
    
    // Build local coordinate system
    const up = Math.abs(dot(normal, new Vec4(0, 1, 0, 0))) < 0.99 ? new Vec4(0, 1, 0, 0) : new Vec4(1, 0, 0, 0);
    const right = normalize(cross4(new Vec4(0, 1, 0, 0), normal, new Vec4(0, 0, 1, 0)));
    const newNormal = normalize(normal);
    
    // Sample direction in tangent space then transform
    const sampleDir = new Vec4(x, y, z, 0);
    // Transform to world space (simplified)
    rayDirNorm = new Vec4(
      right.x * sampleDir.x + up.x * sampleDir.y + normal.x * sampleDir.z,
      right.y * sampleDir.x + up.y * sampleDir.y + normal.y * sampleDir.z,
      right.z * sampleDir.x + up.z * sampleDir.z + normal.z * sampleDir.z,
      0
    );
    
    // Continue with throughput multiplied by BRDF
    const brdfVal = diffuse.x + specular.x; // simplified
    throughput = Vec4.mul(throughput, new Vec4(brdfVal, brdfVal, brdfVal, 1));
  }
  
  return color;
}

// Helper for 4D cross product (used in coordinate system generation)
function cross4(a, b, c) {
  const r = new Vec4();
  r.x =  a.y * (b.z * c.w - b.w * c.z) - a.z * (b.y * c.w - b.w * c.y) + a.w * (b.y * c.z - b.z * c.y);
  r.y = -a.x * (b.z * c.w - b.w * c.z) + a.z * (b.x * c.w - b.w * c.x) - a.w * (b.x * c.z - b.z * c.x);
  r.z =  a.x * (b.y * c.w - b.w * c.y) - a.y * (b.x * c.w - b.w * c.x) + a.w * (b.x * c.y - b.y * c.x);
  r.w = -a.x * (b.y * c.z - b.z * c.y) + a.y * (b.x * c.z - b.z * c.x) - a.z * (b.x * c.y - b.y * c.y);
  return r;
}

// Scene intersection
function sceneIntersect(rayOrig, rayDir, rng) {
  let closestT = Infinity;
  let hitNormal = new Vec4();
  let hitMaterial = { albedo: { r: 0.8, g: 0.8, b: 0.8 }, roughness: 0.5 };
  
  // Sphere at origin
  // ray: O + t*D, sphere: |P|^2 = R^2
  // |O + tD|^2 = R^2 => (O·O) + 2t(O·D) + t^2(D·D) = R^2
  // t^2 + 2(O·D)t + (O·O - R^2) = 0
  
  // Sphere: center (0,0,0), radius 1
  const O = rayOrig; // Vec4
  const D = rayDir; // Vec4
  
  const a = dot(D, D); // = 1 for normalized direction
  const b = 2 * dot(O, D);
  const c = dot(O, O) - 1.0; // R^2 = 1
  
  const discriminant = b * b - 4 * a * c;
  
  if (discriminant >= 0) {
    const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
    const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);
    
    // Take the closest positive hit
    if (t1 > 0.001 && t1 < closestT) {
      closestT = t1;
      // Normal at point = point / R (sphere at origin)
      const hitPoint = Vec4.add(rayOrig, Vec4.mul(rayDir, t1));
      hitNormal = normalize(hitPoint); // normalize gives us the normal
      // Material: light gray with some roughness
      hitMaterial = { albedo: { r: 0.8, g: 0.8, b: 0.8 }, roughness: 0.5 };
    }
    
    if (t2 > 0.001 && t2 < closestT) {
      closestT = t2;
      const hitPoint = Vec4.add(rayOrig, Vec4.mul(rayDir, t2));
      hitNormal = normalize(hitPoint);
      hitMaterial = { albedo: { r: 0.8, g: 0.8, b: 0.8 }, roughness: 0.5 };
    }
  }
  
  // Floor plane: y = 0
  // ray.y * t + rayOrig.y = 0 => t = -rayOrig.y / ray.y
  if (Math.abs(rayDir.y) > 0.0001) {
    const t = -rayOrig.y / rayDir.y;
    if (t > 0.001 && t < closestT) {
      closestT = t;
      hitNormal = new Vec4(0, 1, 0, 0); // upward normal
      hitMaterial = { albedo: { r: 0.2, g: 0.3, b: 0.5 }, roughness: 0.8 };
    }
  }
  
  return closestT < Infinity 
    ? { hit: true, t: closestT, normal: hitNormal, material: hitMaterial }
    : { hit: false, t: Infinity, normal: new Vec4(), material: hitMaterial };
}

// ============================================================
// Tile Renderer
// ============================================================

/**
 * Render a tile of pixels given position and seed.
 * 
 * @param {number} tileIndex Stable tile index (determines seed)
 * @param {number} gridSize Grid size (e.g., 32 for 32×32 tiles)
 * @param {number} imageWidth Full image width in pixels
 * @param {number} imageHeight Full image height in pixels
 * @param {number} seed Initial seed for Mulberry32 PRNG
 * @param {number} x0 Tile left coordinate
 * @param {number} y0 Tile top coordinate
 * @param {number} tileW Tile width in pixels
 * @param {number} tileH Tile height in pixels
 * @returns {Float32Array} Pixel data (RGBA, length = tileW * tileH * 4)
 */
function renderTile(tileIndex, gridSize, imageWidth, imageHeight, seed, x0, y0, actualW, actualH) {
  // Initialize PRNG with deterministic seed
  const rng = new Mulberry32(seed);
  
  // Output buffer: RGBA float32 per pixel
  // Use actual dimensions (account for edge clipping), not grid-derived tileW/tileH
  const pixels = new Float32Array(actualW * actualH * 4);
  
  // Render each pixel in the tile
  for (let localY = 0; localY < actualH; localY++) {
    for (let localX = 0; localX < actualW; localX++) {
      const px = x0 + localX;
      const py = y0 + localY;
      
      // Trace the pixel
      const color = tracePixel(localX, localY, actualW, actualH, rng, 5);
      
      // Clamp to [0,1] and write to output
      const idx = (localY * actualH + localX) * 4;
      pixels[idx + 0] = Math.min(Math.max(color.x, 0), 1); // R
      pixels[idx + 1] = Math.min(Math.max(color.y, 0), 1); // G
      pixels[idx + 2] = Math.min(Math.max(color.z, 0), 1); // B
      pixels[idx + 3] = 1.0; // A (opacity)
    }
  }
  
  return pixels;
}

// ============================================================
// Seed Contract (Axiom-X ABI)
// S_tile = H(masterSeed, sceneId, frameId, tileX, tileY)
// This ensures tile 17 always gets the same seed regardless of worker count.
// ============================================================

/**
 * Deterministic seed derivation per the Axiom-X contract.
 * Every backend (Node, C++, OpenCL, etc.) must implement this same function.
 */
function makeAxiomSeed(masterSeed, sceneId, frameId, tileX, tileY) {
  let h = masterSeed ^ 0xA70FE3A1;
  h ^= (tileX & 0xFFFFFFFF) << 12;
  h = (h << 19) | (h >>> 13);
  h ^= (tileY & 0xFFFFFFFF) << 5;
  h = (h << 15) | (h >>> 17);
  h ^= (sceneId.length & 0xFFFFFFFF) << 19;
  h = (h << 7) | (h >>> 25);
  h ^= (frameId & 0xFFFFFFFF);
  return (h >>> 0) & 0xFFFFFFFF;
}

// ============================================================
// Image Rendering
// ============================================================

/**
 * Render the full image by dispatching tiles.
 * 
 * @param {number} gridSize Number of tiles per side (e.g., 32 = 1024 tiles)
 * @param {number} imageWidth Full image width in pixels
 * @param {number} imageHeight Full image height in pixels
 * @param {number} masterSeed Master seed for the Axiom-X experiment
 * @param {string} sceneId Scene identifier
 * @param {number} frameId Frame number
 * @returns {Object} { pixels: Float32Array, oracleHash: string }
 */
function renderImage(gridSize, imageWidth, imageHeight, masterSeed, sceneId, frameId) {
  const totalTiles = gridSize * gridSize;
  const tileW = Math.floor(imageWidth / gridSize);
  const tileH = Math.floor(imageHeight / gridSize);
  
  const outputPixels = new Float32Array(imageWidth * imageHeight * 4);
  
  // Render each tile (sequential for oracle, parallel for experiment)
  for (let tileIndex = 0; tileIndex < totalTiles; tileIndex++) {
    // Derive stable seed from tile index (Axiom-X contract)
    const tx = tileIndex % gridSize;
    const ty = Math.floor(tileIndex / gridSize);
    const seed = makeAxiomSeed(masterSeed, sceneId, frameId, tx, ty);
    
    // Compute tile bounds
    const x0 = tx * tileW;
    const y0 = ty * tileH;
    const x1 = Math.min(x0 + tileW, imageWidth);
    const y1 = Math.min(y0 + tileH, imageHeight);
    const actualW = x1 - x0;
    const actualH = y1 - y0;
    
    // Render tile
    const tilePixels = renderTile(
      tileIndex, gridSize, imageWidth, imageHeight,
      seed, x0, y0, actualW, actualH
    );
    
    // Write tile to output buffer
    const baseOffset = (y0 * imageWidth + x0) * 4;
    for (let i = 0; i < tilePixels.length; i++) {
      const idx = baseOffset + i;
      // Clamp and write
      outputPixels[idx] = Math.min(Math.max(tilePixels[i], 0), 1);
      // Skip 3 more bytes (R,G,B already written, A at +3)
      if ((i % 4) === 3) outputPixels[idx] = 1.0; // A channel
    }
  }
  
  // Compute SHA-256 oracle
  const hashBuffer = Buffer.from(outputPixels.buffer, outputPixels.byteOffset, outputPixels.byteLength);
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(hashBuffer);
  const oracleHash = hash.digest('hex');
  
  return { pixels: outputPixels, oracleHash };
}

 // ============================================================
// Shared Atomic Tile Queue (for workers)
// ============================================================

/**
 * Atomically pull the next tile index from the shared queue.
 * Uses Atomics.add on a SharedArrayBuffer queue counter.
 * Returns the tile index before increment, or null if exhausted.
 * 
 * @param {number} totalTiles Total number of tiles
 * @param {Int32Array} queueView Int32Array view of the queue buffer (index 0 is the counter)
 * @returns {number|null} Tile index, or null if no more tiles
 */
function pullNextTile(totalTiles, queueView) {
  // Atomically increment and read the counter
  // Returns the index BEFORE increment, so first call returns 0
  const tileIndex = Atomics.add(queueView, 0, 1);

  if (tileIndex >= totalTiles) {
    return null; // No more tiles
  }
  return tileIndex;
}

// Export for Node usage
module.exports = {
  renderImage,
  makeAxiomSeed,
  Mulberry32,
  renderTile,
  tracePixel,
  sceneIntersect,
  pullNextTile
};