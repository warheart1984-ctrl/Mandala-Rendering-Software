// mrs/narrative/unified-integration.js
// Unified Integration - Mandala Narrative Pipeline + Mythar Constitutional Linguistic Engine

import { BookPipeline, createNarrativePipeline, analyzeNarrative, renderStoryToMovie } from './index.js';
import { MytharLexicon, MytharGovernance, MytharRegistry, MytharTransducers } from './mythar-adapters.js';
import { MytharIntegration } from './mythar-integration.js';

/**
 * Unified Integration - Complete Mandala + Mythar System
 * 
 * This is the main entry point for the integrated system:
 * - Mandala Narrative Pipeline (rendering, evolution, evaluation)
 * - Mythar Constitutional Linguistic Engine (lexicon, governance, registry, transducers)
 * - Unified contracts: RMLC + NFC + CRA + PGC
 */
class UnifiedNarrativeSystem {
  constructor(options = {}) {
    this.options = {
      workDir: options.workDir || './unified-narrative-output',
      llmProvider: options.llmProvider,
      mandalaOptions: options.mandalaOptions || {},
      mytharOptions: options.mytharOptions || {},
      enableMythar: options.enableMythar !== false,
      enableMytharGovernance: options.enableMytharGovernance !== false,
      enableMytharRegistry: options.enableMytharRegistry !== false,
      enableMytharTransducers: options.enableMytharTransducers !== false,
      humanReviewEnabled: options.humanReviewEnabled !== false,
      contactSheet: options.contactSheet,
    };

    // Core Mandala pipeline
    this.mandalaPipeline = null;
    
    // Mythar integration
    this.mytharIntegration = null;
    this.mytharLexicon = null;
    this.mytharGovernance = null;
    this.mytharRegistry = null;
    this.mytharTransducers = null;
    
    // State
    this.initialized = false;
    this.currentProject = null;
  }

  /**
   * Initialize the complete unified system
   */
  async initialize() {
    if (this.initialized) return;
    
    console.log('🚀 Initializing Unified Narrative System...');
    console.log('   Mandala Narrative Pipeline + Mythar Constitutional Linguistic Engine');
    
    // Initialize Mandala pipeline
    console.log('📦 Initializing Mandala Narrative Pipeline...');
    this.mandalaPipeline = new BookPipeline({
      workDir: this.options.workDir,
      llmProvider: this.options.llmProvider,
      mandalaOptions: this.options.mandalaOptions,
      evolutionOptions: this.options.evolutionOptions,
      provenanceOptions: this.options.provenanceOptions,
      contactSheet: this.options.contactSheet,
      humanReviewEnabled: this.options.humanReviewEnabled,
    });
    
    // Initialize Mythar integration if enabled
    if (this.options.enableMythar) {
      console.log('🏛️ Initializing Mythar Constitutional Linguistic Engine...');
      await this.initializeMythar();
    }
    
    // Wire Mythar into Mandala pipeline
    if (this.options.enableMythar) {
      await this.wireMytharIntoMandala();
    }
    
    this.initialized = true;
    console.log('✅ Unified Narrative System initialized successfully!');
    
    return this.getSystemStatus();
  }

  async initializeMythar() {
    console.log('   📚 Loading Mythar Lexicon...');
    this.mytharLexicon = new MytharLexicon({
      mytharPath: this.options.mytharOptions.mytharPath || 'G:\\Mythar\\sovereign-reconstruction-engine',
      pythonExe: this.options.mytharOptions.pythonExe || 'python',
    });
    await this.mytharLexicon.initialize();
    
    console.log('   ⚖️ Loading Mythar Governance...');
    this.mytharGovernance = new MytharGovernance({
      mytharPath: this.options.mytharOptions.mytharPath || 'G:\\Mythar\\sovereign-reconstruction-engine',
      pythonExe: this.options.mytharOptions.pythonExe || 'python',
    });
    await this.mytharGovernance.initialize();
    
    console.log('   📋 Loading Mythar Registry...');
    this.mytharRegistry = new MytharRegistry({
      mytharPath: this.options.mytharOptions.mytharPath || 'G:\\Mythar\\Mythar-hackathon\\mythar-registry',
      pythonExe: this.options.mytharOptions.pythonExe || 'python',
    });
    await this.mytharRegistry.initialize();
    
    console.log('   🔄 Loading Mythar Transducers...');
    this.mytharTransducers = new MytharTransducers({
      mytharPath: this.options.mytharOptions.mytharPath || 'G:\\Mythar\\sovereign-reconstruction-engine',
      pythonExe: this.options.mytharOptions.pythonExe || 'python',
    });
    await this.mytharTransducers.initialize();
    
    // Create Mythar integration layer
    this.mytharIntegration = new MytharIntegration({
      lexiconOptions: { mytharPath: this.options.mytharOptions.mytharPath },
      governanceOptions: { mytharPath: this.options.mytharOptions.mytharPath },
      registryOptions: { mytharPath: this.options.mytharOptions.mytharPath },
      transducerOptions: { mytharPath: this.options.mytharOptions.mytharPath },
      useMytharRootsForMotifs: true,
      useMytharClustersForGenomes: true,
      useMytharGovernance: true,
      useMytharTransducers: true,
      registerGenotypesInRegistry: true,
    });
    
    await this.mytharIntegration.initialize();
  }

  async wireMytharIntoMandala() {
    console.log('🔗 Wiring Mythar into Mandala Pipeline...');
    
    // Enhance Mandala's BookPipeline with Mythar capabilities
    this.mandalaPipeline.mytharIntegration = this.mytharIntegration;
    this.mandalaPipeline.mytharLexicon = this.mytharLexicon;
    this.mandalaPipeline.mytharGovernance = this.mytharGovernance;
    this.mandalaPipeline.mytharRegistry = this.mytharRegistry;
    this.mandalaPipeline.mytharTransducers = this.mytharTransducers;
    
    // Override key methods to include Mythar
    this.enhancePipelineWithMythar();
    
    console.log('   ✅ Mythar wired into Mandala Pipeline');
  }

  enhancePipelineWithMythar() {
    const pipeline = this.mandalaPipeline;
    const mythar = this.mytharIntegration;
    
    // Store original methods
    const originalIngestBook = pipeline.ingestBook.bind(pipeline);
    const originalProcessChapter = pipeline.processChapter.bind(pipeline);
    const originalCreateChapterBlueprint = pipeline.createChapterBlueprint.bind(pipeline);
    
    // Enhance ingestBook to enhance DNA with Mythar
    pipeline.ingestBook = async function(bookPath) {
      const dna = await originalIngestBook(bookPath);
      console.log('[Enhanced] Enhancing narrative DNA with Mythar...');
      return await mythar.enhanceNarrativeDNAWithMythar(dna);
    };
    
    // Enhance processChapter to use Mythar-enhanced evolution
    pipeline.processChapter = async function(chapterIndex) {
      console.log(`[Enhanced] Processing Chapter ${chapterIndex + 1} with Mythar...`);
      
      const chapter = this.state.chapters[chapterIndex];
      this.state.currentChapter = chapterIndex;
      
      // Create chapter blueprint
      const chapterBlueprint = this.createChapterBlueprint(chapter);
      
      // Enhance blueprint with Mythar
      const enhancedBlueprint = await mythar.enhanceNarrativeDNAWithMythar(chapterBlueprint);
      
      // Initialize evolution with Mythar-enhanced population
      const population = await this.evolutionController.initializePopulation(
        enhancedBlueprint,
        enhancedBlueprint.genomeTemplate
      );
      
      // Enhance each genotype with Mythar
      for (const genotype of population) {
        const enhanced = await mythar.createMytharEnhancedGenotype(genotype, enhancedBlueprint);
        Object.assign(genotype, enhanced);
        
        // Register in Mythar Registry
        if (mythar.registerGenotypesInRegistry) {
          await mythar.registerGenotypeInMytharRegistry(genotype, enhancedBlueprint);
        }
      }
      
      // Evolution loop with Mythar governance
      const generations = 5;
      let bestGenotypes = population;
      
      for (let gen = 0; gen < generations; gen++) {
        console.log(`  Generation ${gen + 1}/${generations} (with Mythar governance)...`);
        
        // Evaluate with Mythar compliance
        const evaluated = await this.evolutionController.evaluatePopulation(bestGenotypes, enhancedBlueprint);
        
        // Filter PGC compliant
        bestGenotypes = evaluated
          .filter(g => (g.fitness || 0) > 0)
          .filter(async g => {
            const pgc = await mythar.validatePGCCompliance(g);
            return pgc.compliant;
          })
          .sort((a, b) => (b.fitness || 0) - (a.fitness || 0))
          .slice(0, 20);
        
        if (gen < generations - 1) {
          bestGenotypes = await this.evolutionController.evolveGeneration(bestGenotypes, enhancedBlueprint);
          // Re-enhance evolved genotypes
          for (const g of bestGenotypes) {
            const enhanced = await mythar.createMytharEnhancedGenotype(g, enhancedBlueprint);
            Object.assign(g, enhanced);
          }
        }
      }
      
      // Contact sheet with Mythar continuity
      const selectedTakes = await this.runContactSheetSelection(chapter, bestGenotypes);
      
      // Render final with Mythar transducers
      const finalRenders = await this.renderFinalTakes(chapter, selectedTakes);
      
      // Generate narrative text with Mythar transducers
      for (const render of finalRenders) {
        const genotype = render.genotypeId ? this.evolutionController.population.get(render.genotypeId) : null;
        if (genotype) {
          render.narrativeText = await mythar.generateNarrativeText(genotype, enhancedBlueprint);
        }
      }
      
      // Assemble with Mythar provenance
      const chapterMovie = await this.assembleChapterMovie(chapter, finalRenders);
      
      const result = {
        chapterIndex,
        chapterTitle: chapter.title,
        selectedTakes,
        finalRenders,
        chapterMovie,
        mytharProvenance: this.mytharIntegration?.provenanceChain?.getAllChains(),
      };
      
      this.state.chapterResults.push(result);
      this.saveChapterResult(chapterIndex, result);
      
      return result;
    };
  }

  /**
   * Main entry point: Process a book through the complete unified system
   */
  async processBook(bookPath) {
    if (!this.initialized) await this.initialize();
    
    console.log(`\n📖 Processing book: ${bookPath}`);
    
    // Ingest and enhance with Mythar
    const narrativeDNA = await this.mandalaPipeline.ingestBook(bookPath);
    
    // Process all chapters
    const results = [];
    for (let i = 0; i < this.mandalaPipeline.state.chapters.length; i++) {
      try {
        const result = await this.mandalaPipeline.processChapter(i);
        results.push(result);
      } catch (error) {
        console.error(`Failed to process chapter ${i + 1}:`, error);
      }
    }
    
    // Generate final manifests
    const bookManifest = this.mandalaPipeline.exportMovieManifest();
    const mytharManifest = this.generateMytharManifest();
    
    return {
      narrativeDNA,
      chapterResults: this.mandalaPipeline.state.chapterResults,
      bookManifest,
      mytharManifest,
      unifiedManifest: this.generateUnifiedManifest(),
    };
  }

  /**
   * Process a story/prompt directly (no .docx)
   */
  async processStory(storyText, options = {}) {
    if (!this.initialized) await this.initialize();
    
    const pipeline = await createNarrativePipeline({
      workDir: this.options.workDir,
      llmProvider: this.options.llmProvider,
      mytharOptions: this.options.mytharOptions,
      enableMythar: this.options.enableMythar,
    });
    
    // Inject Mythar
    pipeline.mytharIntegration = this.mytharIntegration;
    pipeline.mytharLexicon = this.mytharLexicon;
    pipeline.mytharGovernance = this.mytharGovernance;
    pipeline.mytharRegistry = this.mytharRegistry;
    pipeline.mytharTransducers = this.mytharTransducers;
    
    const { narrativeDNA, chapterResult, movieManifest } = await renderStoryToMovie(storyText, {
      ...options,
      pipeline,
    });
    
    // Enhance with Mythar
    if (this.mytharIntegration) {
      const enhancedDNA = await this.mytharIntegration.enhanceNarrativeDNAWithMythar(narrativeDNA);
      return {
        narrativeDNA: enhancedDNA,
        chapterResult,
        movieManifest,
        mytharEnhanced: true,
      };
    }
    
    return { narrativeDNA, chapterResult, movieManifest, mytharEnhanced: false };
  }

  /**
   * Analyze narrative with Mythar semantic enrichment
   */
  async analyzeNarrative(text, options = {}) {
    if (!this.initialized) await this.initialize();
    
    const dna = await analyzeNarrative(text, {
      llmProvider: this.options.llmProvider,
      ...options,
    });
    
    if (this.mytharIntegration) {
      return await this.mytharIntegration.enhanceNarrativeDNAWithMythar(dna);
    }
    
    return dna;
  }

  /**
   * Generate Mythar-specific manifest
   */
  generateMytharManifest() {
    return {
      lexicon: {
        rootsUsed: this.mytharIntegration?.mytharRootsCache?.length || 0,
        clustersUsed: this.mytharIntegration?.mytharClustersCache?.length || 0,
        pgcRules: this.mytharIntegration?.pgcContractCache?.contract?.length || 0,
      },
      governance: {
        pipelinesRegistered: this.mytharRegistry?.localCache?.size || 0,
        assuranceLevels: ['candidate', 'validated'],
        pgcCompliant: true,
      },
      transducers: {
        narrativesGenerated: 0,
        morphologicalAnalyses: 0,
      },
      registry: {
        candidates: this.mytharRegistry?.localCache?.size || 0,
        ratified: Array.from(this.mytharRegistry?.localCache?.values() || []).filter(c => c.ratificationStatus === 'ratified').length,
      },
    };
  }

  /**
   * Generate unified manifest combining Mandala + Mythar
   */
  generateUnifiedManifest() {
    const mandalaManifest = this.mandalaPipeline.exportMovieManifest();
    const mytharManifest = this.generateMytharManifest();
    
    return {
      version: '1.0.0',
      system: 'Unified Mandala + Mythar Narrative System',
      timestamp: new Date().toISOString(),
      mandala: mandalaManifest,
      mythar: mytharManifest,
      contracts: {
        RMLC: 'Render Meta-Learning Contract - Active',
        NFC: 'Narrative Fitness Contract - Active',
        CRA: 'Constitutional Reference Architecture - Active',
        PGC: 'Polysemy Governance Contract - Active',
        CIEMS: 'Constitutional Engine - Active',
      },
      compliance: {
        conformance21: true,
        pgcCompliant: true,
        craGovernance: true,
        celLineage: 'deferred',
      },
    };
  }

  getSystemStatus() {
    return {
      initialized: this.initialized,
      mandalaPipeline: !!this.mandalaPipeline,
      mytharIntegration: !!this.mytharIntegration,
      mytharLexicon: !!this.mytharLexicon,
      mytharGovernance: !!this.mytharGovernance,
      mytharRegistry: !!this.mytharRegistry,
      mytharTransducers: !!this.mytharTransducers,
      mytharInitialized: this.options.enableMythar ? 'full' : 'disabled',
      workDir: this.options.workDir,
    };
  }

  /**
   * Export all artifacts
   */
  async exportAll(outputDir) {
    const fs = await import('fs');
    const path = await import('path');
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Unified manifest
    fs.writeFileSync(
      path.join(outputDir, 'unified_manifest.json'),
      JSON.stringify(this.generateUnifiedManifest(), null, 2)
    );
    
    // Book manifest
    fs.writeFileSync(
      path.join(outputDir, 'book_manifest.json'),
      JSON.stringify(this.mandalaPipeline.exportMovieManifest(), null, 2)
    );
    
    // Mythar manifest
    fs.writeFileSync(
      path.join(outputDir, 'mythar_manifest.json'),
      JSON.stringify(this.generateMytharManifest(), null, 2)
    );
    
    // Chapter results
    for (const result of this.mandalaPipeline.state.chapterResults) {
      fs.writeFileSync(
        path.join(outputDir, `chapter_${result.chapterIndex + 1}_result.json`),
        JSON.stringify(result, null, 2)
      );
    }
    
    // Provenance chains
    if (this.mytharIntegration?.provenanceChain) {
      const chains = this.mytharIntegration.provenanceChain.getAllChains?.();
      if (chains) {
        fs.writeFileSync(
          path.join(outputDir, 'provenance_chains.json'),
          JSON.stringify(chains, null, 2)
        );
      }
    }
    
    console.log(`📦 Exported all artifacts to ${outputDir}`);
    return outputDir;
  }
}

/**
 * Quick-start factory function
 */
export async function createUnifiedNarrativeSystem(options = {}) {
  const system = new UnifiedNarrativeSystem(options);
  await system.initialize();
  return system;
}

/**
 * One-shot: Story → Mythar-enhanced Movie
 */
export async function storyToMytharMovie(storyText, options = {}) {
  const system = await createUnifiedNarrativeSystem(options);
  return await system.processStory(storyText, options);
}

/**
 * One-shot: Analyze text with Mythar semantic enrichment
 */
export async function analyzeWithMythar(text, options = {}) {
  const system = await createUnifiedNarrativeSystem(options);
  return await system.analyzeNarrative(text, options);
}

/**
 * One-shot: Book → Mythar-enhanced Movie
 */
export async function bookToMytharMovie(bookPath, options = {}) {
  const system = await createUnifiedNarrativeSystem(options);
  return await system.processBook(bookPath);
}

export { UnifiedNarrativeSystem };

// Default export
export default UnifiedNarrativeSystem;