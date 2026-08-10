// mrs/narrative/evolution-controller.js
// Evolution Controller - population management, mutation, selection with CIEMS governance

import { 
  PipelineGenotypeSchema, 
  BlueprintPatternSchema, 
  FitnessRecordSchema,
  validatePipelineGenotype,
  validateFitnessRecord 
} from './genome-schemas.js';
import { v4 as uuidv4 } from 'uuid';

export class EvolutionController {
  constructor(options = {}) {
    this.populationSize = options.populationSize || 50;
    this.eliteSize = options.eliteSize || 5;
    this.mutationRate = options.mutationRate || 0.15;
    this.crossoverRate = options.crossoverRate || 0.3;
    this.tournamentSize = options.tournamentSize || 3;
    
    // Governance
    this.cieMS = options.cieMS; // CIEMS Constitutional Engine
    this.governanceAdapter = options.governanceAdapter;
    this.conformanceAdapter = options.conformanceAdapter;
    this.evidenceService = options.evidenceService;
    
    // State
    this.population = new Map(); // genotypeId -> PipelineGenotype
    this.blueprintPatterns = new Map(); // patternId -> BlueprintPattern
    this.fitnessRecords = new Map(); // recordId -> FitnessRecord
    this.generation = 0;
    
    // Meta-learning
    this.metaLearner = options.metaLearner || null;
  }

  /**
   * Initialize population for a blueprint
   * @param {object} blueprint - Blueprint from NarrativeDNAExtractor
   * @param {object} genomeTemplate - Array of per-beat genome templates
   * @returns {Promise<PipelineGenotype[]>} Initial population
   */
  async initializePopulation(blueprint, genomeTemplate) {
    const population = [];
    const blueprintId = uuidv4();
    const blueprintPatternId = await this.registerBlueprintPattern(blueprint);
    
    for (let i = 0; i < this.populationSize; i++) {
      const genotype = await this.createRandomGenotype(blueprint, genomeTemplate, blueprintPatternId, blueprintId);
      population.push(genotype);
      this.population.set(genotype.id, genotype);
    }
    
    this.generation = 0;
    return population;
  }

  /**
   * Create a random genotype from template
   */
  async createRandomGenotype(blueprint, genomeTemplate, blueprintPatternId, blueprintId) {
    const template = genomeTemplate[0]; // Use first beat template as base
    
    // Randomize visual genome - only extract visual fields from template
    const visualGenome = {
      beatIndex: 0,
      geometry: this.randomChoice(template.geometryOptions || ['tesseract']),
      geometryOptions: template.geometryOptions || ['tesseract'],
      material: this.randomChoice(template.materialOptions || ['lambertian']),
      materialOptions: template.materialOptions || ['lambertian'],
      palette: this.randomPalette(template.palette),
      cameraPath: this.randomChoice([
        'standard-orbit', 'dynamic-orbit', 'slow-drift', 'aggressive-push'
      ]),
      cameraSpeed: this.randomChoice(['slow', 'medium', 'fast']),
      lightingMood: this.randomChoice([
        'bright-dramatic', 'soft-warm', 'harsh-contrast', 'dim-cold', 'neutral-balanced'
      ]),
      mutationRate: template.mutationRate ?? 0.15,
      continuityWeight: template.continuityWeight ?? 0.7,
      fitnessWeights: template.fitnessWeights || {
        visualFidelity: 0.3,
        narrativeAlignment: 0.4,
        emotionalResonance: 0.2,
        technicalQuality: 0.1,
      },
    };
    
    // Randomize temporal genome
    const temporalGenome = {
      beatIndex: 0,
      duration: 135 + Math.random() * 60 - 30, // 105-195s
      transitionType: this.randomChoice(['cut', 'dissolve', 'smash-cut', 'slow-fade']),
      transitionDuration: 1 + Math.random() * 4,
      pacingCurve: this.randomChoice(['linear', 'ease-in', 'ease-out', 'ease-in-out']),
      fps: 30,
    };
    
    // Randomize semantic genome
    const semanticGenome = {
      beatIndex: 0,
      symbols: this.randomSubset(blueprint.semantics?.symbols || ['archive', 'seal', 'tesseract'], 3),
      motifs: this.randomSubset(
        (blueprint.semantics?.motifs || ['crystallized moments', 'infinite shelves', 'fourth dimension', 'golden light'])
          .map(m => typeof m === 'object' ? m.motif : m),
        3
      ),
      themes: this.randomSubset(blueprint.semantics?.themes?.map(t => t.theme) || ['memory/identity', 'transformation', 'power/control'], 2),
      characters: this.randomSubset(blueprint.characters?.map(c => c.name) || ['The Archivist', 'First Seal', 'Archive'], 2),
      locations: this.randomSubset(['archive chamber', 'fourth dimension', 'pedestal', 'infinite shelves'], 2),
      keyPhrases: this.randomSubset(['First Seal', 'crystallized moments', 'continuous unfolding', 'Archive breathed'], 2),
      requiredElements: [],
      forbiddenElements: [],
      narrativeFidelityThreshold: 0.7,
    };
    
    // Randomize emotional genome
    const emotionalGenome = {
      beatIndex: 0,
      valence: -1 + Math.random() * 2,
      arousal: Math.random(),
      dominance: Math.random(),
      primaryEmotion: this.randomChoice([
        'excitement', 'contentment', 'anger', 'sadness', 'triumph', 
        'fear', 'calm', 'neutral', 'wonder', 'awe'
      ]),
      intensity: Math.random(),
      emotionalContinuity: 0.7,
      allowEmotionShift: true,
    };
    
    // SME topology (start simple)
    const smeTopology = {
      modules: ['sme.vis', 'sme.gen', 'sme.log'],
      connections: [
        { from: 'sme.vis', to: 'sme.gen', type: 'sequential' },
        { from: 'sme.gen', to: 'sme.log', type: 'sequential' },
      ],
    };
    
    // Arena selection
    const arenaSelection = {
      primary: 'gpu',
      fallback: ['cpu'],
      selectionReason: 'Initial random assignment',
    };
    
const genotype = {
      id: uuidv4(),
      version: 1,
      blueprintId,
      blueprintPattern: blueprintPatternId,
      visual: visualGenome,
      temporal: temporalGenome,
      semantic: semanticGenome,
      emotional: emotionalGenome,
      smeTopology,
      arenaSelection,
      quality: {
        resolution: { width: 512, height: 512 },
        samplesPerPixel: 16,
        maxDepth: 4,
        denoise: false,
      },
      createdAt: new Date().toISOString(),
      governance: { approved: false },
    };
    
    // DEBUG: Log the semantic field being validated
    console.log('DEBUG semantic field:', JSON.stringify(semanticGenome, null, 2));
    console.log('DEBUG semantic type:', typeof semanticGenome);
    console.log('DEBUG semantic keys:', Object.keys(semanticGenome));
    console.log('DEBUG semantic symbols type:', typeof semanticGenome.symbols);
    console.log('DEBUG semantic symbols value:', semanticGenome.symbols);
    console.log('DEBUG semantic motifs type:', typeof semanticGenome.motifs);
    console.log('DEBUG semantic motifs value:', semanticGenome.motifs);
    
    // DEBUG: Check the schema
    console.log('DEBUG PipelineGenotypeSchema.shape.semantic:', PipelineGenotypeSchema.shape.semantic?.constructor?.name || 'unknown');
    
    // Validate
    const result = validatePipelineGenotype(genotype);
    if (!result.success) {
      throw new Error(`Invalid genotype: ${JSON.stringify(result.error.flatten().fieldErrors)}`);
    }
    
    return genotype;
  }

  /**
   * Evaluate population - render all genotypes and score them
   * @param {PipelineGenotype[]} population 
   * @param {object} blueprint - Narrative DNA blueprint
   * @returns {Promise<PipelineGenotype[]>} Population with fitness scores
   */
  async evaluatePopulation(population, blueprint) {
    const evaluated = [];
    
    for (const genotype of population) {
      try {
        // Render via Mandala
        const renderResult = await this.renderGenotype(genotype, blueprint);
        
        // Conformance check (CIEMS)
        const conformance = await this.checkConformance(genotype, renderResult);
        if (!conformance.passed) {
          genotype.fitness = 0;
          genotype.governance = { ...genotype.governance, conformanceReport: conformance.reportRef };
          evaluated.push(genotype);
          continue;
        }
        
        // Governance check
        const governance = await this.checkGovernance(genotype, renderResult);
        if (!governance.allowed) {
          genotype.fitness = 0;
          evaluated.push(genotype);
          continue;
        }
        
        // Narrative evaluation (NFC)
        const narrativeScores = await this.evaluateNarrative(genotype, blueprint, renderResult);
        
        // Technical quality
        const technicalQuality = this.assessTechnicalQuality(renderResult);
        
        // Compute fitness
        const weights = genotype.visual.fitnessWeights;
        const fitness = 
          weights.visualFidelity * renderResult.visualQuality +
          weights.narrativeAlignment * narrativeScores.semanticResonance +
          weights.emotionalResonance * narrativeScores.emotionalAlignment +
          weights.technicalQuality * technicalQuality;
        
        genotype.fitness = fitness;
        genotype.fitnessBreakdown = {
          visualFidelity: renderResult.visualQuality,
          narrativeAlignment: narrativeScores.semanticResonance,
          emotionalResonance: narrativeScores.emotionalAlignment,
          technicalQuality,
        };
        
        // Create fitness record (RMLC)
        await this.createFitnessRecord(genotype, blueprint, renderResult, narrativeScores, conformance);
        
        evaluated.push(genotype);
      } catch (error) {
        console.error(`Evaluation failed for ${genotype.id}:`, error);
        genotype.fitness = 0;
        evaluated.push(genotype);
      }
    }
    
    return evaluated;
  }

  /**
   * Render a genotype via Mandala MCP/REST
   */
  async renderGenotype(genotype, blueprint) {
    // Build render request from genotype
    const renderRequest = this.buildRenderRequest(genotype, blueprint);
    
    // Call Sovereign X router for optimal arena selection
    const routingResult = await this.routeRender(renderRequest);
    
    // Execute render
    const result = await this.executeRender(routingResult);
    
    return result;
  }

  /**
   * Build render request from genotype
   */
  buildRenderRequest(genotype, blueprint) {
    const visual = genotype.visual;
    const temporal = genotype.temporal;
    const quality = genotype.quality;
    
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
      },
      identity: {
        requestId: `render-${genotype.id}`,
        actorId: '4dce.director',
      },
      context: {
        actorIdentity: { id: '4dce.director', type: 'director' },
        evidence: { id: `ev-render-${genotype.id}`, items: [] },
        lattice: { nodeState: 'active', spineState: 'ready' },
        gpu: { available: true },
      },
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
        id: `mesh-${visual.geometry}`,
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
   * Route render via Sovereign X
   */
  async routeRender(renderRequest) {
    // Call mrs.sovereignx.route tool
    // Returns arena selection + efficiency metrics
    return {
      arena: 'gpu',
      renderRequest,
      efficiency: { estimatedTime: 30, flopsPerWatt: 1.2e12 },
    };
  }

  /**
   * Execute render via Mandala
   */
  async executeRender(routingResult) {
    // Call mrs.render.rt4d tool
    // Returns render artifact + provenance
    return {
      artifact: {
        id: `render-${uuidv4()}`,
        format: 'video/mp4',
        data: null, // base64 or path
        duration: routingResult.renderRequest.renderParams.duration,
      },
      provenance: {
        renderIdentity: routingResult.renderRequest.identity,
        arena: routingResult.arena,
        pathTracerVersion: 'rt4d-js-v1',
      },
      evidence: {
        hash: 'sha256-' + uuidv4(),
        replayToken: `replay-${uuidv4()}`,
      },
      visualQuality: 0.85 + Math.random() * 0.1, // simulated
      conformanceReportRef: `cr-${uuidv4()}`,
    };
  }

  /**
   * Check conformance via CIEMS
   */
  async checkConformance(genotype, renderResult) {
    // Call conformance adapter with 21 checks
    return {
      passed: true,
      reportRef: renderResult.conformanceReportRef,
      details: [],
    };
  }

  /**
   * Check governance via CIEMS
   */
  async checkGovernance(genotype, renderResult) {
    // Call governance adapter
    return {
      allowed: true,
      contract: 'contract.director.v1',
      authorityChain: { authority: true, validation: true, decision: true, evidence: true, verification: true, replay: true, audit: true },
    };
  }

  /**
   * Evaluate narrative fitness (NFC)
   */
  async evaluateNarrative(genotype, blueprint, renderResult) {
    // In production: call LLM evaluator + human-in-loop
    // For now: simulated scores based on genome alignment
    
    const visualAlignment = this.computeVisualAlignment(genotype, blueprint);
    const semanticResonance = this.computeSemanticResonance(genotype, blueprint);
    const emotionalAlignment = this.computeEmotionalAlignment(genotype, blueprint);
    const motifFidelity = this.computeMotifFidelity(genotype, blueprint);
    const pacingCoherence = this.computePacingCoherence(genotype, blueprint);
    
    return {
      semanticResonance,
      emotionalAlignment,
      motifFidelity,
      pacingCoherence,
    };
  }

  /**
   * Assess technical quality of render
   */
  assessTechnicalQuality(renderResult) {
    // Based on conformance, visual quality, frame consistency
    return renderResult.visualQuality || 0.8;
  }

  // Alignment computation helpers
  computeVisualAlignment(genotype, blueprint) {
    // How well visual genome matches blueprint's visual motifs
    const template = blueprint.genomeTemplate[0];
    const visual = genotype.visual;
    
    let score = 0;
    if (template.geometryOptions?.includes(visual.geometry)) score += 0.3;
    if (template.materialOptions?.includes(visual.material)) score += 0.2;
    if (this.paletteSimilarity(visual.palette, template.palette) > 0.7) score += 0.3;
    if (template.cameraPath === visual.cameraPath) score += 0.2;
    
    return Math.min(1, score);
  }

  computeSemanticResonance(genotype, blueprint) {
    const semantic = genotype.semantic;
    const blueprintSemantics = blueprint.semantics;
    
    let score = 0;
    const symbolOverlap = this.arrayOverlap(semantic.symbols, blueprintSemantics?.symbols || []).length;
    const motifOverlap = this.arrayOverlap(semantic.motifs, blueprintSemantics?.motifs?.map(m => m.motif) || []).length;
    const themeOverlap = this.arrayOverlap(semantic.themes, blueprintSemantics?.themes?.map(t => t.theme) || []).length;
    
    score += Math.min(0.4, symbolOverlap * 0.1);
    score += Math.min(0.3, motifOverlap * 0.15);
    score += Math.min(0.3, themeOverlap * 0.2);
    
    return Math.min(1, score);
  }

  computeEmotionalAlignment(genotype, blueprint) {
    const emotional = genotype.emotional;
    const blueprintEmotion = blueprint.emotionalArc?.beats[0];
    
    if (!blueprintEmotion) return 0.5;
    
    const valenceDiff = Math.abs(emotional.valence - blueprintEmotion.valence);
    const arousalDiff = Math.abs(emotional.arousal - blueprintEmotion.arousal);
    const dominanceDiff = Math.abs(emotional.dominance - blueprintEmotion.dominance);
    const emotionMatch = emotional.primaryEmotion === blueprintEmotion.primaryEmotion ? 1 : 0;
    
    return 1 - (valenceDiff + arousalDiff + dominanceDiff) / 3 * 0.7 + emotionMatch * 0.3;
  }

  computeMotifFidelity(genotype, blueprint) {
    return this.computeVisualAlignment(genotype, blueprint) * 0.6 + 
           this.computeSemanticResonance(genotype, blueprint) * 0.4;
  }

  computePacingCoherence(genotype, blueprint) {
    const temporal = genotype.temporal;
    const blueprintPacing = blueprint.pacing?.recommendedCuts[0];
    
    if (!blueprintPacing) return 0.7;
    
    const durationDiff = Math.abs(temporal.duration - blueprintPacing.targetDuration) / blueprintPacing.targetDuration;
    return Math.max(0, 1 - durationDiff);
  }

  /**
   * Selection - tournament selection for next generation
   */
  selectParents(population) {
    const sorted = [...population].sort((a, b) => (b.fitness || 0) - (a.fitness || 0));
    
    // Elitism
    const elites = sorted.slice(0, this.eliteSize);
    
    // Tournament selection for rest
    const parents = [...elites];
    while (parents.length < this.populationSize) {
      const tournament = this.randomSample(sorted, this.tournamentSize);
      const winner = tournament.reduce((best, current) => 
        (current.fitness || 0) > (best.fitness || 0) ? current : best
      );
      parents.push(winner);
    }
    
    return parents;
  }

  /**
   * Crossover - combine two parent genotypes
   */
  async crossover(parent1, parent2) {
    const child = { ...parent1, id: uuidv4(), version: parent1.version + 1 };
    
    // Randomly inherit from each parent
    if (Math.random() < this.crossoverRate) {
      // Visual crossover
      child.visual = {
        ...parent1.visual,
        geometry: Math.random() < 0.5 ? parent1.visual.geometry : parent2.visual.geometry,
        material: Math.random() < 0.5 ? parent1.visual.material : parent2.visual.material,
        palette: Math.random() < 0.5 ? parent1.visual.palette : parent2.visual.palette,
        cameraPath: Math.random() < 0.5 ? parent1.visual.cameraPath : parent2.visual.cameraPath,
      };
      
      // Temporal crossover
      child.temporal = {
        ...parent1.temporal,
        duration: (parent1.temporal.duration + parent2.temporal.duration) / 2,
        transitionType: Math.random() < 0.5 ? parent1.temporal.transitionType : parent2.temporal.transitionType,
      };
      
      // Semantic crossover
      child.semantic = {
        ...parent1.semantic,
        symbols: [...new Set([...parent1.semantic.symbols, ...parent2.semantic.symbols])].slice(0, 10),
        motifs: [...new Set([...parent1.semantic.motifs, ...parent2.semantic.motifs])].slice(0, 10),
      };
      
      // Emotional crossover
      child.emotional = {
        ...parent1.emotional,
        valence: (parent1.emotional.valence + parent2.emotional.valence) / 2,
        arousal: (parent1.emotional.arousal + parent2.emotional.arousal) / 2,
        primaryEmotion: Math.random() < 0.5 ? parent1.emotional.primaryEmotion : parent2.emotional.primaryEmotion,
      };
      
      // SME topology crossover
      child.smeTopology = Math.random() < 0.5 ? parent1.smeTopology : parent2.smeTopology;
      
      // Arena crossover
      child.arenaSelection = Math.random() < 0.5 ? parent1.arenaSelection : parent2.arenaSelection;
    }
    
    return child;
  }

  /**
   * Mutation - apply random mutations
   */
  async mutate(genotype) {
    const mutated = { ...genotype, id: uuidv4(), version: genotype.version + 1 };
    let mutationType = 'parameters';
    
    // Visual mutations
    if (Math.random() < this.mutationRate) {
      mutated.visual = { ...mutated.visual };
      const mutation = Math.random();
      if (mutation < 0.25) mutated.visual.geometry = this.randomChoice(genotype.visual.geometryOptions);
      else if (mutation < 0.5) mutated.visual.material = this.randomChoice(genotype.visual.materialOptions);
      else if (mutation < 0.75) mutated.visual.palette = this.randomPalette(genotype.visual.palette);
      else mutated.visual.cameraPath = this.randomChoice(['standard-orbit', 'dynamic-orbit', 'slow-drift', 'aggressive-push']);
      mutationType = 'parameters';
    }
    
    // Temporal mutations
    if (Math.random() < this.mutationRate) {
      mutated.temporal = { ...mutated.temporal };
      mutated.temporal.duration = Math.max(30, mutated.temporal.duration + (Math.random() - 0.5) * 60);
      mutated.temporal.transitionType = this.randomChoice(['cut', 'dissolve', 'smash-cut', 'slow-fade']);
    }
    
    // SME topology mutations (more significant)
    if (Math.random() < this.mutationRate * 0.3) {
      mutated.smeTopology = this.mutateSME(mutated.smeTopology);
      mutationType = 'topology';
    }
    
    // Arena mutations
    if (Math.random() < this.mutationRate * 0.2) {
      mutated.arenaSelection = {
        ...mutated.arenaSelection,
        primary: this.randomChoice(['cpu', 'gpu', 'vm', 'llvm']),
        selectionReason: 'Mutated arena selection',
      };
      mutationType = 'arena';
    }
    
    // Validate
    const result = validatePipelineGenotype(mutated);
    if (!result.success) {
      return genotype; // Return original if invalid
    }
    
    return { genotype: mutated, mutationType };
  }

  /**
   * Mutate SME topology
   */
  mutateSME(topology) {
    const newTopology = { ...topology };
    const modules = ['sme.txt', 'sme.vis', 'sme.aud', 'sme.vid', 'sme.gen', 'sme.log', 'sme.core'];
    
    if (Math.random() < 0.5 && newTopology.modules.length < 5) {
      // Add module
      const available = modules.filter(m => !newTopology.modules.includes(m));
      if (available.length > 0) {
        newTopology.modules.push(this.randomChoice(available));
      }
    } else if (newTopology.modules.length > 2) {
      // Remove module
      newTopology.modules.splice(Math.floor(Math.random() * newTopology.modules.length), 1);
    }
    
    // Mutate connections
    if (Math.random() < 0.3) {
      newTopology.connections = this.randomizeConnections(newTopology.modules);
    }
    
    return newTopology;
  }

  /**
   * Create fitness record (RMLC)
   */
  async createFitnessRecord(genotype, blueprint, renderResult, narrativeScores, conformance) {
    const record = {
      id: uuidv4(),
      blueprintPatternId: genotype.blueprintPatternId,
      genotypeId: genotype.id,
      fitness: genotype.fitness,
      fitnessBreakdown: genotype.fitnessBreakdown,
      evidenceRef: renderResult.evidence?.hash || `ev-${genotype.id}`,
      conformanceReportRef: conformance.reportRef,
      narrativeScores,
      signedBy: '4dce.director',
      signature: `sig-${uuidv4()}`,
      timestamp: new Date().toISOString(),
    };
    
    const result = validateFitnessRecord(record);
    if (result.success) {
      this.fitnessRecords.set(record.id, record);
      
      // Update blueprint pattern with new best genotype
      await this.updateBlueprintPattern(genotype.blueprintPatternId, record);
    }
    
    return record;
  }

  /**
   * Update blueprint pattern with fitness record
   */
  async updateBlueprintPattern(patternId, fitnessRecord) {
    const pattern = this.blueprintPatterns.get(patternId);
    if (!pattern) return;
    
    // Add to best genotypes if fitness is high
    if (fitnessRecord.fitness > 0.7) {
      const existing = pattern.bestGenotypes.find(g => g.genotypeId === fitnessRecord.genotypeId);
      if (!existing) {
        pattern.bestGenotypes.push({
          genotypeId: fitnessRecord.genotypeId,
          fitness: fitnessRecord.fitness,
          fitnessBreakdown: fitnessRecord.fitnessBreakdown,
          evidenceRef: fitnessRecord.evidenceRef,
        });
        // Keep top 10
        pattern.bestGenotypes.sort((a, b) => b.fitness - a.fitness);
        pattern.bestGenotypes = pattern.bestGenotypes.slice(0, 10);
      }
    }
    
    pattern.updatedAt = new Date().toISOString();
  }

  /**
   * Register blueprint pattern for meta-learning
   */
  async registerBlueprintPattern(blueprint) {
    const patternId = uuidv4();
    const pattern = {
      id: patternId,
      sourceType: blueprint.metadata?.targetFormat || 'book',
      sourceHash: this.hashString(JSON.stringify(blueprint)),
      features: {
        technical: {
          complexityScore: blueprint.structure?.beats?.length / 100 || 0.5,
          geometryTypes: blueprint.visualMotifs?.flatMap(v => v.geometries) || [],
          materialTypes: blueprint.visualMotifs?.flatMap(v => v.materials) || [],
          estimatedDuration: blueprint.pacing?.totalTargetDuration || 5400,
        },
        narrative: {
          beatCount: blueprint.structure?.beats?.length || 40,
          themeVector: [], // Would be embedding
          emotionalArcHash: this.hashString(JSON.stringify(blueprint.emotionalArc)),
          characterCount: blueprint.characters?.length || 0,
        },
        semantic: {
          symbolCount: blueprint.semantics?.symbols?.length || 0,
          motifCount: blueprint.semantics?.motifs?.length || 0,
          keyPhraseCount: blueprint.semantics?.keyPhrases?.length || 0,
        },
      },
      bestGenotypes: [],
      mutationHistory: [],
      updatedAt: new Date().toISOString(),
    };
    
    const result = BlueprintPatternSchema.safeParse(pattern);
    if (result.success) {
      this.blueprintPatterns.set(patternId, pattern);
    }
    
    return patternId;
  }

  /**
   * Evolve one generation
   */
  async evolveGeneration(population, blueprint) {
    // Evaluate
    const evaluated = await this.evaluatePopulation(population, blueprint);
    
    // Select parents
    const parents = this.selectParents(evaluated);
    
    // Generate offspring
    const offspring = [];
    for (let i = 0; i < this.populationSize - this.eliteSize; i += 2) {
      const parent1 = parents[i % parents.length];
      const parent2 = parents[(i + 1) % parents.length];
      
      // Crossover
      const child1 = await this.crossover(parent1, parent2);
      const child2 = await this.crossover(parent2, parent1);
      
      // Mutation
      const { genotype: mutated1 } = await this.mutate(child1);
      const { genotype: mutated2 } = await this.mutate(child2);
      
      offspring.push(mutated1, mutated2);
    }
    
    // Add elites
    const sorted = [...evaluated].sort((a, b) => (b.fitness || 0) - (a.fitness || 0));
    const nextGen = [...sorted.slice(0, this.eliteSize), ...offspring.slice(0, this.populationSize - this.eliteSize)];
    
    this.generation++;
    
    // Update population map
    this.population.clear();
    for (const g of nextGen) this.population.set(g.id, g);
    
    return nextGen;
  }

  /**
   * Propose mutations for a blueprint (RMLC propose_mutations)
   */
  async proposeMutations(blueprintPatternId, count = 5) {
    const pattern = this.blueprintPatterns.get(blueprintPatternId);
    if (!pattern || pattern.bestGenotypes.length === 0) {
      return [];
    }
    
    const proposals = [];
    const bestGenotypes = pattern.bestGenotypes.slice(0, 3);
    
    for (const best of bestGenotypes) {
      const genotype = this.population.get(best.genotypeId);
      if (!genotype) continue;
      
      // Generate mutation candidates
      for (let i = 0; i < count; i++) {
        const { genotype: mutated, mutationType } = await this.mutate(genotype);
        
        // Estimate fitness using meta-learner if available
        let expectedFitness = best.fitness;
        if (this.metaLearner) {
          expectedFitness = await this.metaLearner.predictFitness(mutated, pattern);
        } else {
          // Heuristic: small mutations near high-fitness genotypes tend to maintain fitness
          expectedFitness = best.fitness * (0.9 + Math.random() * 0.2);
        }
        
        proposals.push({
          genotypeId: mutated.id,
          parentGenotypeId: best.genotypeId,
          mutationType,
          expectedFitness,
          constitutionalRisk: this.assessConstitutionalRisk(mutated, genotype),
          reasoning: this.generateMutationReasoning(mutated, genotype, mutationType),
        });
      }
    }
    
    // Sort by expected fitness
    proposals.sort((a, b) => b.expectedFitness - a.expectedFitness);
    
    return proposals.slice(0, count);
  }

  /**
   * Assess constitutional risk of mutation
   */
  assessConstitutionalRisk(mutated, original) {
    let risk = 0;
    
    // Topology changes are higher risk
    if (JSON.stringify(mutated.smeTopology) !== JSON.stringify(original.smeTopology)) {
      risk += 0.3;
    }
    
    // Arena changes are medium risk
    if (mutated.arenaSelection.primary !== original.arenaSelection.primary) {
      risk += 0.2;
    }
    
    // Large parameter changes
    const visualDiff = this.computeVisualDiff(mutated.visual, original.visual);
    if (visualDiff > 0.5) risk += 0.2;
    
    // Quality reduction
    if (mutated.quality.samplesPerPixel < original.quality.samplesPerPixel) risk += 0.1;
    
    return Math.min(1, risk);
  }

  /**
   * Generate reasoning for mutation
   */
  generateMutationReasoning(mutated, original, mutationType) {
    const reasons = [];
    
    if (mutationType === 'topology') {
      const added = mutated.smeTopology.modules.filter(m => !original.smeTopology.modules.includes(m));
      const removed = original.smeTopology.modules.filter(m => !mutated.smeTopology.modules.includes(m));
      if (added.length) reasons.push(`Added SME modules: ${added.join(', ')}`);
      if (removed.length) reasons.push(`Removed SME modules: ${removed.join(', ')}`);
    }
    
    if (mutationType === 'arena') {
      reasons.push(`Changed arena from ${original.arenaSelection.primary} to ${mutated.arenaSelection.primary} for efficiency`);
    }
    
    if (mutationType === 'parameters') {
      const changes = [];
      if (mutated.visual.geometry !== original.visual.geometry) changes.push(`geometry: ${original.visual.geometry} → ${mutated.visual.geometry}`);
      if (mutated.visual.material !== original.visual.material) changes.push(`material: ${original.visual.material} → ${mutated.visual.material}`);
      if (mutated.visual.cameraPath !== original.visual.cameraPath) changes.push(`camera: ${original.visual.cameraPath} → ${mutated.visual.cameraPath}`);
      if (changes.length) reasons.push(`Visual parameters: ${changes.join('; ')}`);
    }
    
    return reasons.join(' | ');
  }

  // Utility methods
  randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  randomSample(arr, n) { return arr.sort(() => 0.5 - Math.random()).slice(0, n); }
  randomSubset(arr, n) { return arr.sort(() => 0.5 - Math.random()).slice(0, Math.min(n, arr.length)); }
  randomPalette(base) { return base.sort(() => 0.5 - Math.random()).slice(0, 5); }
  hashString(str) { return Array.from(str).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0).toString(16); }
  computeVisualDiff(v1, v2) {
    let diff = 0;
    if (v1.geometry !== v2.geometry) diff += 0.3;
    if (v1.material !== v2.material) diff += 0.2;
    if (v1.cameraPath !== v2.cameraPath) diff += 0.2;
    if (this.paletteSimilarity(v1.palette, v2.palette) < 0.5) diff += 0.3;
    return diff;
  }
  paletteSimilarity(p1, p2) {
    const set1 = new Set(p1);
    const set2 = new Set(p2);
    const intersection = [...set1].filter(x => set2.has(x)).length;
    return intersection / Math.max(set1.size, set2.size);
  }
  arrayOverlap(a, b) { return a.filter(x => b.includes(x)); }

  // Placeholder methods for geometry/material definitions
  getGeometryDefinition(type) { return { vertices: [], indices: [] }; }
  getMaterialDefinition(type, palette) { return { albedo: palette[0] }; }
}

export default EvolutionController;