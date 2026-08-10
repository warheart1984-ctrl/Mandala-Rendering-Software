// mrs/narrative/mandala-render-client.js
// Mandala Render Integration - MCP/REST batch rendering with Sovereign X routing

import fetch from 'node-fetch';

export class MandalaRenderClient {
  constructor(options = {}) {
    this.mcpEndpoint = options.mcpEndpoint || 'http://localhost:8080';
    this.restEndpoint = options.restEndpoint || 'http://localhost:8081';
    this.sovereignXEndpoint = options.sovereignXEndpoint || 'http://localhost:8081/api/v1/sovereignx';
    this.apiKey = options.apiKey || 'mrs_director_test_key_12345';
    this.defaultTimeout = options.timeout || 300000; // 5 min per render
    
    // Batch configuration
    this.maxConcurrentRenders = options.maxConcurrentRenders || 4;
    this.batchQueue = [];
    this.activeRenders = 0;
    
    // Retry configuration
    this.maxRetries = options.maxRetries || 2;
    this.retryDelay = options.retryDelay || 5000;
  }

  /**
   * Render a single genotype via Mandala
   * @param {object} genotype - PipelineGenotype
   * @param {object} blueprint - Narrative DNA blueprint
   * @returns {Promise<object>} Render result with artifact, provenance, evidence
   */
  async renderGenotype(genotype, blueprint) {
    const renderRequest = this.buildRenderRequest(genotype, blueprint);
    
    // Route via Sovereign X for optimal arena selection
    const routingResult = await this.routeViaSovereignX(renderRequest);
    
    // Execute render with retry logic
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.executeRender(routingResult);
        
        // Verify conformance
        const conformance = await this.checkConformance(genotype, result);
        if (!conformance.passed) {
          throw new Error(`Conformance failed: ${conformance.details}`);
        }
        
        return {
          ...result,
          genotypeId: genotype.id,
          conformanceReportRef: conformance.reportRef,
        };
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          console.warn(`Render attempt ${attempt + 1} failed, retrying:`, error.message);
          await this.sleep(this.retryDelay * (attempt + 1));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Batch render multiple genotypes with concurrency control
   * @param {PipelineGenotype[]} genotypes 
   * @param {object} blueprint
   * @returns {Promise<object[]>} Array of render results
   */
  async batchRender(genotypes, blueprint) {
    const results = [];
    const queue = [...genotypes];
    
    const workers = Array(this.maxConcurrentRenders).fill(null).map(async () => {
      while (queue.length > 0) {
        const genotype = queue.shift();
        if (!genotype) break;
        
        try {
          const result = await this.renderGenotype(genotype, blueprint);
          results.push({ genotypeId: genotype.id, success: true, result });
        } catch (error) {
          results.push({ genotypeId: genotype.id, success: false, error: error.message });
        }
      }
    });
    
    await Promise.all(workers);
    return results;
  }

  /**
   * Route render request via Sovereign X Constitutional Compute Scheduler
   */
  async routeViaSovereignX(renderRequest) {
    const response = await this.fetchWithAuth(`${this.sovereignXEndpoint}/route`, {
      method: 'POST',
      body: JSON.stringify(renderRequest),
    });
    
    if (!response.ok) {
      // Fallback to direct render if Sovereign X unavailable
      console.warn('Sovereign X routing failed, using direct render');
      return { arena: 'gpu', renderRequest, efficiency: { estimatedTime: 60 } };
    }
    
    return response.json();
  }

  /**
   * Execute render via Mandala MCP/REST
   */
  async executeRender(routingResult) {
    const { renderRequest } = routingResult;
    
    // Use REST endpoint for rendering
    const response = await this.fetchWithAuth(`${this.restEndpoint}/render`, {
      method: 'POST',
      body: JSON.stringify(renderRequest),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Render failed: ${error.details || error.message}`);
    }
    
    const result = await response.json();
    
    // Enhance with routing info
    return {
      ...result.result,
      arena: routingResult.arena,
      efficiency: routingResult.efficiency,
      sovereignXCorrelationId: routingResult.correlationId,
    };
  }

  /**
   * Check conformance via CIEMS
   */
  async checkConformance(genotype, renderResult) {
    try {
      const response = await this.fetchWithAuth(`${this.restEndpoint}/api/v1/conformance/check`, {
        method: 'POST',
        body: JSON.stringify({
          genotypeId: genotype.id,
          renderResult,
        }),
      });
      
      if (!response.ok) {
        return { passed: false, details: 'Conformance check failed' };
      }
      
      return response.json();
    } catch (error) {
      console.warn('Conformance check failed:', error.message);
      return { passed: false, details: error.message };
    }
  }

  /**
   * Submit DEP workflow execution
   */
  async executeDEP(depRequest) {
    const response = await this.fetchWithAuth(`${this.restEndpoint}/api/v1/dep/execute`, {
      method: 'POST',
      body: JSON.stringify(depRequest),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`DEP execution failed: ${error.details || error.message}`);
    }
    
    return response.json();
  }

  /**
   * Dispatch SME tasks
   */
  async dispatchSME(smeRequest) {
    const response = await this.fetchWithAuth(`${this.restEndpoint}/api/v1/sme/dispatch`, {
      method: 'POST',
      body: JSON.stringify(smeRequest),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`SME dispatch failed: ${error.details || error.message}`);
    }
    
    return response.json();
  }

  /**
   * Get Sovereign X statistics
   */
  async getSovereignXStats() {
    const response = await this.fetchWithAuth(`${this.sovereignXEndpoint}/stats`);
    return response.json();
  }

  /**
   * Detect HIP/ROCm SDK
   */
  async detectHIP() {
    const response = await this.fetchWithAuth(`${this.sovereignXEndpoint}/hip/detect`, {
      method: 'POST',
      body: JSON.stringify({ invokeTools: true }),
    });
    return response.json();
  }

  /**
   * Build render request from genotype and blueprint
   */
  buildRenderRequest(genotype, blueprint) {
    // Ensure all required fields have defaults
    const visual = genotype.visual || {};
    const temporal = genotype.temporal || {};
    const semantic = genotype.semantic || {};
    const emotional = genotype.emotional || {};
    const quality = genotype.quality || {};
    
    const identity = {
      requestId: `render-${genotype.id || uuidv4()}-${Date.now()}`,
      actorId: visual.actorId || '4dce.director',
      latticeNodeId: `narrative-${blueprint.metadata?.title || 'unknown'}`,
      timestamp: new Date().toISOString(),
    };
    
    // Build context with narrative evidence
    const context = {
      actorIdentity: { id: '4dce.director', type: 'director' },
      evidence: {
        id: `ev-render-${genotype.id || uuidv4()}`,
        worldId: `narrative-${blueprint.metadata?.title || 'unknown'}`,
        timelineId: `chapter-${blueprint.structure?.beats?.[0]?.index || 0}`,
        items: [
          { id: `ev-visual-${visual.geometry || 'tesseract'}` },
          { id: `ev-semantic-${(semantic.symbols || []).join('-') || 'none'}` },
          { id: `ev-emotional-${emotional.primaryEmotion || 'neutral'}` },
        ],
      },
      lattice: { nodeState: 'active', spineState: 'ready', dependencyMap: {} },
      gpu: { available: true },
      narrativeContext: {
        beatIndex: visual.beatIndex || 0,
        narrativeAlignment: visual.fitnessWeights?.narrativeAlignment || 0.3,
        emotionalResonance: visual.fitnessWeights?.emotionalResonance || 0.2,
      },
    };
    
    // Build scene from genotype
    const scene = this.buildSceneFromGenotype(genotype, blueprint);
    
    return {
      scene,
      renderParams: {
        resolution: quality.resolution,
        samplesPerPixel: quality.samplesPerPixel,
        maxDepth: quality.maxDepth,
        duration: temporal.duration,
        fps: temporal.fps,
        cameraPath: visual.cameraPath,
        cameraSpeed: visual.cameraSpeed,
        lightingMood: visual.lightingMood,
        transitionType: temporal.transitionType,
        transitionDuration: temporal.transitionDuration,
        motionBlur: temporal.motionBlur,
        shutterAngle: temporal.shutterAngle,
      },
      identity,
      context,
    };
  }

  /**
   * Build 4D scene from genotype
   */
  buildSceneFromGenotype(genotype, blueprint) {
    const visual = genotype.visual;
    
    // Get geometry definition
    const geometryDef = this.getGeometryDefinition(visual.geometry);
    const materialDef = this.getMaterialDefinition(visual.material, visual.palette);
    
    return {
      metric: { type: 'euclidean' },
      camera: {
        position4D: [0, 0, 0, 0],
        target4D: [0, 0, 1, 0],
        up4D: [0, 1, 0, 0],
        fov: 60,
        path: visual.cameraPath,
        speed: visual.cameraSpeed,
      },
      meshes: [{
        id: `mesh-${visual.geometry}-${genotype.id}`,
        geometry: visual.geometry,
        vertices4D: geometryDef.vertices,
        indices: geometryDef.indices,
        materialId: visual.material,
      }],
      surfaces: [{
        id: visual.material,
        type: visual.material,
        ...materialDef,
      }],
    };
  }

  /**
   * HTTP fetch with authentication
   */
  async fetchWithAuth(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'Idempotency-Key': options.idempotencyKey || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...options.headers,
    };
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.defaultTimeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.defaultTimeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get geometry definition for 4D primitives
   */
  getGeometryDefinition(type) {
    const definitions = {
      'tesseract': {
        vertices: [
          [0,0,0,0], [1,0,0,0], [1,1,0,0], [0,1,0,0],
          [0,0,1,0], [1,0,1,0], [1,1,1,0], [0,1,1,0],
          [0,0,0,1], [1,0,0,1], [1,1,0,1], [0,1,0,1],
          [0,0,1,1], [1,0,1,1], [1,1,1,1], [0,1,1,1],
        ],
        indices: [
          // 3D cube faces (w=0)
          0,1,2, 0,2,3, 4,5,6, 4,6,7,
          0,1,5, 0,5,4, 2,3,7, 2,7,6,
          1,2,6, 1,6,5, 0,3,7, 0,7,4,
          // 4D faces (connecting w=0 to w=1)
          0,1,9, 0,9,8, 1,2,10, 1,10,9,
          2,3,11, 2,11,10, 3,0,8, 3,11,8,
          4,5,13, 4,13,12, 5,6,14, 5,14,13,
          6,7,15, 6,15,14, 7,4,12, 7,15,12,
        ],
      },
      'clifford-torus': {
        vertices: [], // Generated procedurally
        indices: [],
      },
      'hopf-fibration': {
        vertices: [],
        indices: [],
      },
      'gyroid': {
        vertices: [],
        indices: [],
      },
    };
    
    return definitions[type] || definitions['tesseract'];
  }

  /**
   * Get material definition
   */
  getMaterialDefinition(type, palette) {
    const baseColor = palette[0] || '#22e0c4';
    const hexToRgb = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return [r, g, b];
    };
    
    const albedo = baseColor.startsWith('#') ? hexToRgb(baseColor) : [0.13, 0.88, 0.77];
    
    const definitions = {
      'lambertian': { type: 'lambertian', albedo },
      'ggx': { type: 'ggx', albedo, roughness: 0.3, metallic: 0.1 },
      'mirror': { type: 'mirror', albedo: [0.95, 0.95, 0.95] },
      'glass': { type: 'glass', albedo: [0.9, 0.9, 0.95], ior: 1.5 },
      'metal': { type: 'ggx', albedo: [0.7, 0.7, 0.8], roughness: 0.1, metallic: 1.0 },
      'obsidian': { type: 'ggx', albedo: [0.05, 0.05, 0.08], roughness: 0.05, metallic: 0.8 },
      'gold': { type: 'ggx', albedo: [1.0, 0.76, 0.33], roughness: 0.2, metallic: 1.0 },
      'emissive': { type: 'emissive', albedo: [1.0, 0.5, 0.2], emission: [2.0, 1.0, 0.4] },
    };
    
    return definitions[type] || definitions['lambertian'];
  }

  /**
   * Get geometry definition for 4D primitives
   */
  getGeometryDefinition(type) {
    const definitions = {
      'tesseract': {
        vertices: [
          [0,0,0,0], [1,0,0,0], [1,1,0,0], [0,1,0,0],
          [0,0,1,0], [1,0,1,0], [1,1,1,0], [0,1,1,0],
          [0,0,0,1], [1,0,0,1], [1,1,0,1], [0,1,0,1],
          [0,0,1,1], [1,0,1,1], [1,1,1,1], [0,1,1,1],
        ],
        indices: [
          0,1,2, 0,2,3, 4,5,6, 4,6,7,
          0,1,5, 0,5,4, 2,3,7, 2,7,6,
          1,2,6, 1,6,5, 0,3,7, 0,7,4,
          0,1,9, 0,9,8, 1,2,10, 1,10,9,
          2,3,11, 2,11,10, 3,0,8, 3,11,8,
          4,5,13, 4,13,12, 5,6,14, 5,14,13,
          6,7,15, 6,15,14, 7,4,12, 7,15,12,
        ],
      },
      'clifford-torus': { vertices: [], indices: [] },
      'hopf-fibration': { vertices: [], indices: [] },
      'gyroid': { vertices: [], indices: [] },
    };
    
    return definitions[type] || definitions['tesseract'];
  }
}

export default MandalaRenderClient;