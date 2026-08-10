// mrs/narrative/index.js
// Narrative Pipeline - Main exports

export { NarrativeDNAExtractor } from './narrative-dna.js';
export { EvolutionController } from './evolution-controller.js';
export { MandalaRenderClient } from './mandala-render-client.js';
export { NarrativeEvaluator } from './narrative-evaluator.js';
export { ProvenanceChain } from './provenance-chain.js';
export { ContactSheetUI } from './contact-sheet.js';
export { BookPipeline } from './book-pipeline.js';

// Genome schemas
export {
  PipelineGenotypeSchema,
  VisualGenomeSchema,
  TemporalGenomeSchema,
  SemanticGenomeSchema,
  EmotionalGenomeSchema,
  BlueprintPatternSchema,
  FitnessRecordSchema,
  GenomeSchemas,
  validatePipelineGenotype,
  validateVisualGenome,
  validateTemporalGenome,
  validateSemanticGenome,
  validateEmotionalGenome,
  validateBlueprintPattern,
  validateFitnessRecord,
} from './genome-schemas.js';

/**
 * Narrative Pipeline - Complete RMLC/NFC compliant system
 * 
 * Architecture:
 * 
 * Book/Story/Prompt
 *       ↓
 * NarrativeDNAExtractor → Structured Narrative DNA (beats, motifs, arcs, characters)
 *       ↓
 * EvolutionController → Population of PipelineGenotypes (SME topology + Sovereign X routing)
 *       ↓
 * MandalaRenderClient → MCP/REST batch rendering via Sovereign X
 *       ↓
 * NarrativeEvaluator → LLM + auto metrics → NFC-compliant scores
 *       ↓
 * ContactSheetUI → Human-in-the-loop selection with continuity weighting
 *       ↓
 * ProvenanceChain → Genome → Render → Evidence → Replay (NFC invariant)
 *       ↓
 * BookPipeline → .docx → Chapter 1 movie assembly with full provenance
 * 
 * Contracts:
 * - RMLC (Render Meta-Learning Contract): Meta-learning over render pipelines
 * - NFC (Narrative Fitness Contract): Narrative as fitness landscape
 * - CIEMS/COE: Constitutional governance throughout
 */

// Default pipeline factory
export async function createNarrativePipeline(options = {}) {
  const {
    workDir = './narrative-pipeline-output',
    llmProvider = null,
    mandalaOptions = {},
    evolutionOptions = {},
    provenanceOptions = {},
    contactSheet = null,
    humanReviewEnabled = true,
  } = options;

  const pipeline = new BookPipeline({
    workDir,
    llmProvider,
    mandalaOptions,
    evolutionOptions,
    provenanceOptions,
    contactSheet,
    humanReviewEnabled,
  });

  return pipeline;
}

// Quick start function
export async function renderStoryToMovie(storyText, options = {}) {
  const pipeline = await createNarrativePipeline(options);
  
  // Create a minimal narrative DNA from story text
  const dna = await pipeline.dnaExtractor.extract(storyText, {
    title: options.title || 'Untitled Story',
    author: options.author || 'Unknown',
    targetFormat: options.targetFormat || 'movie',
    beatCount: options.beatCount || 20,
  });
  
  pipeline.state.narrativeDNA = dna;
  pipeline.state.chapters = pipeline.splitIntoChapters(dna);
  
  // Process first chapter as demo
  const result = await pipeline.processChapter(0);
  
  return {
    narrativeDNA: dna,
    chapterResult: result,
    movieManifest: pipeline.exportMovieManifest(),
  };
}

// Narrative-only pipeline (no rendering)
export async function analyzeNarrative(text, options = {}) {
  const extractor = new NarrativeDNAExtractor({ llmProvider: options.llmProvider });
  
  return extractor.extract(text, {
    title: options.title || 'Untitled',
    author: options.author || 'Unknown',
    targetFormat: options.targetFormat || 'analysis',
    beatCount: options.beatCount || 40,
  });
}