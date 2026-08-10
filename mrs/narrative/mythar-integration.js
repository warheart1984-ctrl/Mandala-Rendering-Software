// mrs/narrative/mythar-integration.js
// Mythar Integration Layer - Connects Mandala Narrative Pipeline with Mythar's constitutional linguistic engine

import { MytharLexicon, MytharGovernance, MytharRegistry, MytharTransducers } from './mythar-adapters.js';

/**
 * Mythar Integration Layer
 * 
 * Bridges Mandala Narrative Pipeline with Mythar's constitutional linguistic engine:
 * - Lexicon: Roots, clusters, morphemes, polysemy governance (PGC)
 * - Governance: CRA model, PGC contract, CEL lineage, assurance levels
 * - Transducers: Language generation, morphological analysis
 * - Registry: Candidate registration, ratification tracking
 * - Evidence: CEL lineage, provenance chains, governance records
 */
export class MytharIntegration {
  constructor(options = {}) {
    this.mytharLexicon = new MytharLexicon(options.lexiconOptions);
    this.mytharGovernance = new MytharGovernance(options.governanceOptions);
    this.mytharRegistry = new MytharRegistry(options.registryOptions);
    this.mytharTransducers = new MytharTransducers(options.transducerOptions);
    
    // Configuration
    this.useMytharRootsForMotifs = options.useMytharRootsForMotifs !== false;
    this.useMytharClustersForGenomes = options.useMytharClustersForGenomes !== false;
    this.useMytharGovernance = options.useMytharGovernance !== false;
    this.useMytharTransducers = options.useMytharTransducers !== false;
    this.registerGenotypesInRegistry = options.registerGenotypesInRegistry !== false;
    
    // State
    this.mytharRootsCache = null;
    this.mytharClustersCache = null;
    this.pgcContractCache = null;
  }

  /**
   * Initialize Mythar integration
   */
  async initialize() {
    console.log('[MytharIntegration] Initializing Mythar integration...');
    
    // Load lexicon data
    this.mytharRootsCache = await this.mytharLexicon.loadRoots();
    this.mytharClustersCache = await this.mytharLexicon.loadClusters();
    this.pgcContractCache = await this.mytharLexicon.loadPGCContract();
    
    // Initialize governance
    await this.mytharGovernance.initialize();
    
    // Initialize registry
    await this.mytharRegistry.initialize();
    
    // Initialize transducers
    await this.mytharTransducers.initialize();
    
    console.log('[MytharIntegration] Initialized successfully');
    console.log(`  Roots: ${this.mytharRootsCache?.length || 0}`);
    console.log(`  Clusters: ${this.mytharClustersCache?.length || 0}`);
    console.log(`  PGC Rules: ${this.pgcContractCache?.length || 0}`);
    
    return {
      roots: this.mytharRootsCache?.length || 0,
      clusters: this.mytharClustersCache?.length || 0,
      pgcRules: this.pgcContractCache?.length || 0,
    };
  }

  /**
   * Enhance Narrative DNA with Mythar lexicon
   * Maps narrative motifs to Mythar roots/clusters
   */
  async enhanceNarrativeDNAWithMythar(narrativeDNA) {
    if (!this.useMytharRootsForMotifs) return narrativeDNA;
    
    console.log('[MytharIntegration] Enhancing narrative DNA with Mythar lexicon...');
    
    const enhancedDNA = { ...narrativeDNA };
    
    // Map semantic motifs to Mythar roots
    enhancedDNA.mytharRootMotifs = await this.mapMotifsToMytharRoots(narrativeDNA.semantics);
    
    // Map visual motifs to Mythar clusters
    enhancedDNA.mytharClusterGenomes = await this.mapVisualMotifsToClusters(narrativeDNA.visualMotifs);
    
    // Add PGC contract awareness
    enhancedDNA.pgcContract = this.pgcContractCache;
    
    // Add governance metadata
    enhancedDNA.mytharGovernance = {
      assuranceLevel: 'candidate', // Default for new narrative genotypes
      lifecycleState: 'Draft',
      pgcCompliance: true,
    };
    
    return enhancedDNA;
  }

  /**
   * Map narrative semantic motifs to Mythar roots
   */
  async mapMotifsToMytharRoots(semantics) {
    const rootMotifs = [];
    
    // Extract key semantic elements
    const themes = semantics?.themes?.map(t => t.theme) || [];
    const symbols = semantics?.symbols || [];
    const motifs = semantics?.motifs?.map(m => m.motif) || [];
    const keyPhrases = semantics?.keyPhrases || [];
    
    // Combine all semantic elements
    const allSemanticElements = [...themes, ...symbols, ...motifs, ...keyPhrases];
    
    // Map to Mythar roots
    for (const element of allSemanticElements) {
      const matchingRoots = this.findMatchingMytharRoots(element);
      if (matchingRoots.length > 0) {
        rootMotifs.push({
          semanticElement: element,
          mytharRoots: matchingRoots,
          confidence: this.calculateMatchConfidence(element, matchingRoots),
        });
      }
    }
    
    return rootMotifs;
  }

  /**
   * Find Mythar roots matching a semantic element
   */
  findMatchingMytharRoots(element) {
    const matches = [];
    const elementLower = element.toLowerCase();
    
    for (const [form, gloss, domain] of this.mytharRootsCache) {
      // Direct form match
      if (form === elementLower) {
        matches.push({ form, gloss, domain, matchType: 'exact', confidence: 1.0 });
        continue;
      }
      
      // Gloss keyword match
      const glossWords = gloss.toLowerCase().split(/[\s\/\(\)]+/);
      const elementWords = elementLower.split(/[\s\/\(\)]+/);
      
      const overlap = elementWords.filter(w => glossWords.includes(w)).length;
      if (overlap > 0) {
        matches.push({
          form,
          gloss,
          domain,
          matchType: 'gloss-keyword',
          confidence: overlap / Math.max(elementWords.length, glossWords.length),
        });
      }
    }
    
    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches.slice(0, 5); // Top 5 matches
  }

  /**
   * Calculate match confidence
   */
  calculateMatchConfidence(element, matches) {
    if (matches.length === 0) return 0;
    return matches[0].confidence;
  }

  /**
   * Map visual motifs to Mythar clusters for genome generation
   */
  async mapVisualMotifsToClusters(visualMotifs) {
    const clusterGenomes = [];
    
    for (const motif of visualMotifs || []) {
      const matchingClusters = this.findMatchingClusters(motif);
      
      if (matchingClusters.length > 0) {
        clusterGenomes.push({
          sourceMotif: motif,
          mytharClusters: matchingClusters.map(c => ({
            clusterId: c.cluster_id,
            name: c.name,
            forms: c.forms,
            phrase: c.phrase,
            domain: c.domain,
            interpretation: c.interpretation,
            poetic: c.poetic,
            morphemes: c.morphemes,
            reinforces: c.reinforces,
            feeling: c.metadata?.feeling,
          })),
          // Generate genome parameters from cluster
          genomeParams: this.generateGenomeParamsFromClusters(matchingClusters),
        });
      }
    }
    
    return clusterGenomes;
  }

  /**
   * Find clusters matching a visual motif
   */
  findMatchingClusters(motif) {
    const matches = [];
    const geometries = motif.geometries || [];
    const materials = motif.materials || [];
    const palette = motif.palette || [];
    const themes = motif.sourceTheme ? [motif.sourceTheme] : [];
    const symbols = motif.sourceSymbol ? [motif.sourceSymbol] : [];
    
    for (const cluster of this.mytharClustersCache || []) {
      let score = 0;
      const reasons = [];
      
      // Domain match
      if (motif.sourceTheme && cluster.domain === 'nature' && motif.sourceTheme.includes('nature')) {
        score += 0.3;
        reasons.push('domain:nature');
      }
      if (motif.sourceTheme && cluster.domain === 'abstract' && motif.sourceTheme.includes('abstract')) {
        score += 0.2;
        reasons.push('domain:abstract');
      }
      if (cluster.domain === 'kinship' && motifsRelatedToKinship(motif)) {
        score += 0.25;
        reasons.push('domain:kinship');
      }
      if (cluster.domain === 'motion' && motifsRelatedToMotion(motif)) {
        score += 0.25;
        reasons.push('domain:motion');
      }
      if (cluster.domain === 'body' && motifsRelatedToBody(motif)) {
        score += 0.2;
        reasons.push('domain:body');
      }
      
      // Form reinforcement match
      const reinforcedForms = cluster.reinforces || [];
      const motifForms = [...geometries, ...materials, ...themes, ...symbols];
      const formOverlap = motifForms.filter(f => 
        reinforcedForms.some(rf => f.toLowerCase().includes(rf.toLowerCase()))
      ).length;
      if (formOverlap > 0) {
        score += 0.2 * formOverlap;
        reasons.push(`forms:${formOverlap}`);
      }
      
      // Morpheme match
      const morphemes = cluster.morphemes || [];
      const morphemeForms = morphemes.flatMap(m => 
        m.parts?.map(p => p.form) || [m.form]
      );
      const morphemeOverlap = motifForms.filter(f =>
        morphemeForms.some(mf => f.toLowerCase().includes(mf.toLowerCase()))
      ).length;
      if (morphemeOverlap > 0) {
        score += 0.15 * morphemeOverlap;
        reasons.push(`morphemes:${morphemeOverlap}`);
      }
      
      // Palette/feeling match
      if (cluster.metadata?.feeling) {
        const feelingKeywords = cluster.metadata.feeling.toLowerCase().split(/[\s\/]+/);
        const paletteKeywords = palette.flatMap(p => p.toLowerCase().split(''));
        const feelingOverlap = feelingKeywords.filter(k => 
          paletteKeywords.some(pk => pk.includes(k))
        ).length;
        if (feelingOverlap > 0) {
          score += 0.1 * feelingOverlap;
          reasons.push(`feeling:${feelingOverlap}`);
        }
      }
      
      if (score > 0.15) {
        matches.push({
          ...cluster,
          matchScore: Math.min(1, score),
          matchReasons: reasons,
        });
      }
    }
    
    matches.sort((a, b) => b.matchScore - a.matchScore);
    return matches.slice(0, 3);
  }

  /**
   * Generate genome parameters from matching clusters
   */
  generateGenomeParamsFromClusters(clusters) {
    if (!clusters.length) return {};
    
    const topCluster = clusters[0];
    const morphemes = topCluster.morphemes || [];
    const reinforces = topCluster.reinforces || [];
    const domain = topCluster.domain || 'abstract';
    
    // Map domain to geometry preferences
    const domainGeometryMap = {
      'nature': ['clifford-torus', 'hopf-fibration', 'organic-gyroid', 'growing-torus'],
      'motion': ['morphing-tesseract', 'flow-gyroid', 'clashing-tetrahedra'],
      'kinship': ['hopf-fibration', 'linked-tori', 'tesseract'],
      'body': ['tesseract', 'mirror-cube', 'reflective-torus'],
      'abstract': ['tesseract', 'clifford-torus', 'gyroid', 'recursive-cube'],
      'kinship': ['linked-tori', 'tesseract', 'hopf-fibration'],
      'body': ['tesseract', 'mirror-cube', 'absorbing-cube'],
    };
    
    // Map reinforces to materials
    const reinforceMaterialMap = {
      'la': 'mirror', 'ma': 'lambertian', 'ya': 'glass', 'kra': 'ggx',
      'ti': 'subsurface', 'ki': 'emissive', 'ra': 'metal',
      'fu': 'emissive', 'la': 'mirror', 'ma': 'lambertian',
      'yu': 'iridescent', 'fa': 'gold', 'li': 'subsurface',
      'to': 'metal', 'pe': 'lambertian', 'kor': 'subsurface',
      'ra': 'metal', 'fi': 'emissive', 'nu': 'glass',
      'pu': 'emissive', 'sha': 'absorbing', 'sa': 'emissive',
    };
    
    // Select geometry from domain or reinforces
    const preferredGeometries = domainGeometryMap[domain] || ['tesseract', 'clifford-torus', 'gyroid'];
    const geometry = preferredGeometries[0];
    
    // Select material from reinforces
    let material = 'lambertian';
    for (const r of topCluster.reinforces || []) {
      if (reinforceMaterialMap[r]) {
        material = reinforceMaterialMap[r];
        break;
      }
    }
    
    // Build palette from cluster morphemes
    const palette = this.extractPaletteFromMorphemes(morphemes);
    
    return {
      geometry,
      geometryOptions: preferredGeometries,
      material,
      materialOptions: [material, 'lambertian', 'ggx', 'glass'],
      palette,
      // Camera based on domain
      cameraPath: this.domainToCameraPath(domain),
      cameraSpeed: domain === 'motion' ? 'fast' : domain === 'kinship' ? 'slow' : 'medium',
      lightingMood: this.domainToLighting(domain),
      // Fitness weights influenced by cluster
      fitnessWeights: {
        visualFidelity: 0.25,
        narrativeAlignment: 0.35,
        emotionalResonance: 0.25,
        technicalQuality: 0.15,
      },
    };
  }

  domainToCameraPath(domain) {
    const map = {
      'nature': 'gentle-orbit',
      'motion': 'dynamic-orbit',
      'kinship': 'slow-drift',
      'body': 'standard-orbit',
      'abstract': 'standard-orbit',
    };
    return map[domain] || 'standard-orbit';
  }

  domainToLighting(domain) {
    const map = {
      'nature': 'soft-warm',
      'motion': 'bright-dramatic',
      'kinship': 'soft-warm',
      'body': 'neutral-balanced',
      'abstract': 'neutral-balanced',
    };
    return map[domain] || 'neutral-balanced';
  }

  extractPaletteFromMorphemes(morphemes) {
    // Default palettes by morpheme
    const morphemePalettes = {
      'la': ['#22e0c4', '#0fa89a', '#ffffff', '#05070a', '#10141b'],
      'ma': ['#0d1f0d', '#1a3d1a', '#2d5a2d', '#4ade80', '#f0fff0'],
      'ya': ['#fff8e1', '#ffeb3b', '#ffd700', '#1a1a0a', '#2d2d0a'],
      'kra': ['#1a0a0a', '#ff4400', '#ffeb3b', '#8b2d2d', '#fff8e1'],
      'ti': ['#2c1810', '#4a1c2e', '#8b2d4e', '#d46b8a', '#ffebee'],
      'ki': ['#1a0a1a', '#e91e63', '#fff0f5', '#880e4f', '#f8bbd0'],
      'ra': ['#ff6b35', '#f7931e', '#ffcc00', '#1a0a0a', '#ffffff'],
      'fu': ['#fff8e1', '#ffeb3b', '#ffc107', '#1a1a0a', '#fffde7'],
      'yu': ['#e8eaf6', '#7986cb', '#3f51b5', '#1a237e', '#ffffff'],
      'fa': ['#fff3e0', '#ffb74d', '#ff9800', '#e65100', '#ffffff'],
      'lo': ['#fce4ec', '#f8bbd0', '#f48fb1', '#880e4f', '#ffffff'],
      'ni': ['#e8eaf6', '#7986cb', '#3f51b5', '#1a237e', '#ffffff'],
      'to': ['#1a1a1a', '#2d2d2d', '#4a4a4a', '#808080', '#ffffff'],
    };
    
    // This would be extracted from actual morpheme data
    // For now return a default narrative palette
    return ['#0a0a0a', '#1a1a1a', '#22e0c4', '#4b7cff', '#f5b45b'];
  }

  /**
   * Create pipeline genotype with Mythar-enhanced parameters
   */
  async createMytharEnhancedGenotype(baseGenotype, mytharEnhancement) {
    const enhanced = { ...baseGenotype };
    
    // Merge visual genome with Mythar cluster params
    if (mytharEnhancement.mytharClusterGenomes?.length) {
      const clusterParams = mytharEnhancement.mytharClusterGenomes[0]?.genomeParams;
      if (clusterParams) {
        enhanced.visual = {
          ...enhanced.visual,
          ...clusterParams,
          // Keep original fitness weights but boost narrative alignment
          fitnessWeights: {
            ...enhanced.visual.fitnessWeights,
            narrativeAlignment: Math.min(0.5, (enhanced.visual.fitnessWeights.narrativeAlignment || 0.3) + 0.15),
          },
        };
      }
    }
    
    // Add Mythar metadata
    enhanced.mythar = {
      rootMotifs: mytharEnhancement.mytharRootMotifs?.slice(0, 3),
      clusterGenomes: mytharEnhancement.mytharClusterGenomes?.slice(0, 2),
      pgcCompliance: true,
      assuranceLevel: 'candidate',
      lifecycleState: 'Draft',
    };
    
    // Add governance
    if (this.useMytharGovernance) {
      enhanced.governance = {
        ...enhanced.governance,
        mythar: await this.mytharGovernance.createPipelineGovernance(baseGenotype),
      };
    }
    
    return enhanced;
  }

  /**
   * Register genotype in Mythar Registry
   */
  async registerGenotypeInMytharRegistry(genotype, narrativeContext) {
    if (!this.registerGenotypesInRegistry) return null;
    
    const candidate = {
      id: genotype.id,
      type: 'narrative_genotype',
      title: `Narrative Genotype: ${genotype.visual?.geometry || 'unknown'} - ${genotype.visual?.material || 'unknown'}`,
      description: `Narrative genotype for ${narrativeContext?.title || 'unknown'} beat ${genotype.visual?.beatIndex || 0}`,
      narrativeContext: {
        title: narrativeContext?.title,
        beatIndex: genotype.visual?.beatIndex,
        globalBeatIndex: narrativeContext?.globalBeatIndex,
        narrativeAlignment: genotype.visual?.fitnessWeights?.narrativeAlignment,
        emotionalResonance: genotype.visual?.fitnessWeights?.emotionalResonance,
      },
      genotype: {
        visual: genotype.visual,
        temporal: genotype.temporal,
        semantic: genotype.semantic,
        emotional: genotype.emotional,
        smeTopology: genotype.smeTopology,
        arenaSelection: genotype.arenaSelection,
        quality: genotype.quality,
      },
      mytharMetadata: genotype.mythar || {},
      governance: {
        assuranceLevel: 'candidate',
        lifecycleState: 'Draft',
        pgcCompliance: true,
        celLineage: {
          binding_status: 'deferred',
          subject_id: `narrative_genotype_${genotype.id}`,
        },
      },
      fitness: {
        visualFidelity: 0,
        narrativeAlignment: 0,
        emotionalResonance: 0,
        technicalQuality: 0,
      },
      status: 'candidate',
      createdAt: new Date().toISOString(),
    };
    
    const registration = await this.mytharRegistry.registerCandidate(candidate);
    return registration;
  }

  /**
   * Generate narrative text using Mythar transducers
   */
  async generateNarrativeText(genotype, blueprint) {
    if (!this.useMytharTransducers) return null;
    
    // Build morphological input from genotype
    const morphInput = this.buildMorphologicalInput(genotype, blueprint);
    
    // Use Mythar transducer for generation
    const generated = await this.mytharTransducers.generateText(morphInput, {
      mode: 'narrative',
      targetLanguage: 'en',
      style: 'mythic',
    });
    
    return generated;
  }

  /**
   * Build morphological input from genotype
   */
  buildMorphologicalInput(genotype, blueprint) {
    const morphemes = [];
    
    // Add visual morphemes
    if (genotype.visual?.geometry) morphemes.push({ form: genotype.visual.geometry, type: 'geometry' });
    if (genotype.visual?.material) morphemes.push({ form: genotype.visual.material, type: 'material' });
    
    // Add semantic morphemes
    if (genotype.semantic?.symbols) morphemes.push(...genotype.semantic.symbols.map(s => ({ form: s, type: 'symbol' })));
    if (genotype.semantic?.motifs) morphemes.push(...genotype.semantic.motifs.map(m => ({ form: m, type: 'motif' })));
    
    // Add emotional morphemes
    if (genotype.emotional?.primaryEmotion) morphemes.push({ form: genotype.emotional.primaryEmotion, type: 'emotion' });
    
    // Add temporal morphemes
    if (genotype.temporal?.transitionType) morphemes.push({ form: genotype.temporal.transitionType, type: 'transition' });
    
    return {
      morphemes,
      blueprint: blueprint?.metadata?.title || 'untitled',
      targetStyle: 'mythic_narrative',
    };
  }

  /**
   * Validate genotype against PGC contract
   */
  async validatePGCCompliance(genotype) {
    const violations = [];
    
    // Check for polysemy violations in semantic genome
    const symbols = genotype.semantic?.symbols || [];
    const motifs = genotype.semantic?.motifs || [];
    
    for (const symbol of symbols) {
      const pgcCheck = await this.mytharGovernance.checkPGCCompliance(symbol);
      if (!pgcCheck.compliant) {
        violations.push({
          type: 'PGC_VIOLATION',
          element: symbol,
          reason: pgcCheck.reason,
          rule: pgcCheck.rule,
        });
      }
    }
    
    return {
      compliant: violations.length === 0,
      violations,
    };
  }

  /**
   * Get Mythar governance record for pipeline
   */
  async getMytharGovernanceRecord(genotype, blueprint) {
    return await this.mytharGovernance.createPipelineGovernance(genotype, blueprint);
  }
}

// Helper functions
function motifsRelatedToKinship(motif) {
  const kinshipKeywords = ['family', 'mother', 'father', 'child', 'kin', 'blood', 'ancestor', 'descendant', 'lineage'];
  const motifStr = JSON.stringify(motif).toLowerCase();
  return kinshipKeywords.some(k => motifStr.includes(k));
}

function motifsRelatedToMotion(motif) {
  const motionKeywords = ['move', 'flow', 'carry', 'come', 'go', 'journey', 'travel', 'path', 'trajectory', 'motion'];
  const motifStr = JSON.stringify(motif).toLowerCase();
  return motionKeywords.some(k => motifStr.includes(k));
}

function motifsRelatedToBody(motif) {
  const bodyKeywords = ['hand', 'eye', 'foot', 'head', 'heart', 'breath', 'voice', 'touch', 'body', 'sense'];
  const motifStr = JSON.stringify(motif).toLowerCase();
  return bodyKeywords.some(k => motifStr.includes(k));
}

export default MytharIntegration;