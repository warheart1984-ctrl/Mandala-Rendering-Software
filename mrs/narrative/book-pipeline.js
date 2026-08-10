// mrs/narrative/book-pipeline.js
// Book Pipeline - .docx ingestion → Chapter 1 movie assembly

import * as fs from 'fs';
import * as path from 'path';
import { NarrativeDNAExtractor } from './narrative-dna.js';
import { EvolutionController } from './evolution-controller.js';
import { MandalaRenderClient } from './mandala-render-client.js';
import { NarrativeEvaluator } from './narrative-evaluator.js';
import { ProvenanceChain } from './provenance-chain.js';
import { ContactSheetUI } from './contact-sheet.js';
import { v4 as uuidv4 } from 'uuid';

export class BookPipeline {
  constructor(options = {}) {
    this.workDir = options.workDir || './book-pipeline-output';
    this.llmProvider = options.llmProvider;
    this.mandalaClient = new MandalaRenderClient(options.mandalaOptions);
    this.provenanceChain = new ProvenanceChain(options.provenanceOptions);
    
    // Components
    this.dnaExtractor = new NarrativeDNAExtractor({ llmProvider: this.llmProvider });
    this.evolutionController = new EvolutionController({
      ...options.evolutionOptions,
      mandalaClient: this.mandalaClient,
      provenanceChain: this.provenanceChain,
    });
    this.evaluator = new NarrativeEvaluator({ 
      llmProvider: this.llmProvider,
      humanReviewEnabled: options.humanReviewEnabled !== false,
    });
    
    // Contact sheet (UI callback)
    this.contactSheet = options.contactSheet || null;
    
    // Pipeline state
    this.state = {
      bookPath: null,
      bookTitle: null,
      chapters: [],
      currentChapter: 0,
      currentBeat: 0,
      narrativeDNA: null,
      chapterResults: [],
      provenanceChains: [],
    };
    
    // Ensure work directory exists
    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
    }
  }

  /**
   * Ingest a .docx book file
   */
  async ingestBook(bookPath) {
    console.log(`[BookPipeline] Ingesting book: ${bookPath}`);
    
    if (!fs.existsSync(bookPath)) {
      throw new Error(`Book not found: ${bookPath}`);
    }

    // Extract text from .docx
    const text = await this.extractDocxText(bookPath);
    
    // Extract metadata from filename
    const fileName = path.basename(bookPath, '.docx');
    const title = this.extractTitleFromText(text, fileName);
    const author = this.extractAuthorFromText(text);
    
    // Extract narrative DNA
    console.log('[BookPipeline] Extracting narrative DNA...');
    this.state.narrativeDNA = await this.dnaExtractor.extract(text, {
      title,
      author,
      targetFormat: 'movie',
      beatCount: 40, // Chapter 1 ~40 beats
    });
    
    this.state.bookPath = bookPath;
    this.state.bookTitle = title;
    
    // Split into chapters
    this.state.chapters = this.splitIntoChapters(this.state.narrativeDNA);
    
    console.log(`[BookPipeline] Book "${title}" ingested: ${this.state.chapters.length} chapters, ${this.state.narrativeDNA.metadata.beatCount} beats`);
    
    // Save narrative DNA for reference
    const dnaPath = path.join(this.workDir, `${title.replace(/\s+/g, '_')}_narrative_dna.json`);
    fs.writeFileSync(dnaPath, JSON.stringify(this.state.narrativeDNA, null, 2));
    
    return this.state.narrativeDNA;
  }

  /**
   * Extract text from .docx (simplified - in production use mammoth or similar)
   */
  async extractDocxText(docxPath) {
    // In production: use mammoth.extractRawText or similar
    // For now, read as text (assuming plain text .docx for demo)
    const content = fs.readFileSync(docxPath, 'utf8');
    
    // If it's actually a .docx, we'd need proper extraction
    // This is a placeholder
    if (docxPath.endsWith('.docx')) {
      // Use a simple text extraction for demo
      return content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
    }
    return content;
  }

  /**
   * Extract title from text
   */
  extractTitleFromText(text, fallback) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    // Look for title-like patterns
    for (const line of lines.slice(0, 10)) {
      if (line.length > 5 && line.length < 100 && 
          (line === line.toUpperCase() || line[0] === line[0].toUpperCase())) {
        return line;
      }
    }
    return fallback;
  }

  /**
   * Extract author from text
   */
  extractAuthorFromText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines.slice(0, 20)) {
      if (line.toLowerCase().includes('by ') || line.toLowerCase().includes('author')) {
        return line.replace(/^(by|author)[:\s]*/i, '').trim();
      }
    }
    return 'Unknown';
  }

  /**
   * Split narrative DNA into chapters
   */
  splitIntoChapters(narrativeDNA) {
    const beats = narrativeDNA.structure.beats || [];
    const totalBeats = beats.length;
    const beatsPerChapter = Math.ceil(totalBeats / 10); // ~10 chapters
    
    const chapters = [];
    for (let i = 0; i < totalBeats; i += beatsPerChapter) {
      const chapterBeats = beats.slice(i, i + beatsPerChapter);
      chapters.push({
        index: chapters.length,
        title: `Chapter ${chapters.length + 1}`,
        beats: chapterBeats,
        startBeat: i,
        endBeat: Math.min(i + beatsPerChapter, totalBeats) - 1,
        beatCount: chapterBeats.length,
      });
    }
    return chapters;
  }

  /**
   * Process Chapter 1 (or any chapter) through full pipeline
   */
  async processChapter(chapterIndex = 0) {
    const chapter = this.state.chapters[chapterIndex];
    if (!chapter) throw new Error(`Chapter ${chapterIndex} not found`);
    
    console.log(`[BookPipeline] Processing Chapter ${chapter.index + 1}: ${chapter.title}`);
    console.log(`  Beats: ${chapter.startBeat}-${chapter.endBeat} (${chapter.beatCount} beats)`);
    
    this.state.currentChapter = chapterIndex;
    
    // Create chapter-specific blueprint
    const chapterBlueprint = this.createChapterBlueprint(chapter);
    
    // Initialize evolution population
    console.log('[BookPipeline] Initializing evolution population...');
    const population = await this.evolutionController.initializePopulation(
      chapterBlueprint,
      chapterBlueprint.genomeTemplate
    );
    
    // Evolution loop
    const generations = 5; // configurable
    let bestGenotypes = population;
    
    for (let gen = 0; gen < generations; gen++) {
      console.log(`[BookPipeline] Generation ${gen + 1}/${generations}`);
      
      // Evaluate population
      const evaluated = await this.evolutionController.evaluatePopulation(bestGenotypes, chapterBlueprint);
      
      // Sort by fitness
      bestGenotypes = evaluated
        .filter(g => (g.fitness || 0) > 0)
        .sort((a, b) => (b.fitness || 0) - (a.fitness || 0))
        .slice(0, 20); // Keep top 20
      
      console.log(`  Top fitness: ${bestGenotypes[0]?.fitness?.toFixed(4) || 0}`);
      
      // Evolve next generation
      if (gen < generations - 1) {
        bestGenotypes = await this.evolutionController.evolveGeneration(bestGenotypes, chapterBlueprint);
      }
    }
    
    // Contact sheet selection for each beat
    console.log('[BookPipeline] Generating contact sheets for beat selection...');
    const selectedTakes = await this.runContactSheetSelection(chapter, bestGenotypes);
    
    // Render final selected takes
    console.log('[BookPipeline] Rendering final selected takes...');
    const finalRenders = await this.renderFinalTakes(chapter, selectedTakes);
    
    // Assemble chapter movie
    console.log('[BookPipeline] Assembling chapter movie...');
    const chapterMovie = await this.assembleChapterMovie(chapter, finalRenders);
    
    // Save results
    const result = {
      chapterIndex,
      chapterTitle: chapter.title,
      selectedTakes,
      finalRenders,
      chapterMovie,
      provenanceChains: this.state.provenanceChains,
    };
    
    this.state.chapterResults.push(result);
    this.saveChapterResult(chapterIndex, result);
    
    return result;
  }

  /**
   * Create chapter-specific blueprint
   */
  createChapterBlueprint(chapter) {
    const fullDNA = this.state.narrativeDNA;
    
    // Filter narrative DNA for this chapter's beats
    const filteredCharacters = fullDNA.characters
      .map(c => ({
        ...c,
        beats: c.beats
          .filter(b => b >= chapter.startBeat && b <= chapter.endBeat)
          .map(b => b - chapter.startBeat),
      }))
      .filter(c => c.beats.length > 0);
    
    const chapterDNA = {
      ...fullDNA,
      metadata: {
        ...fullDNA.metadata,
        title: `${fullDNA.metadata.title} - ${chapter.title}`,
        beatCount: chapter.beatCount,
      },
      structure: {
        ...fullDNA.structure,
        beats: chapter.beats,
      },
      // Filter other arrays to chapter beats
      semantics: fullDNA.semantics,
      visualMotifs: fullDNA.visualMotifs,
      emotionalArc: {
        ...fullDNA.emotionalArc,
        beats: fullDNA.emotionalArc.beats.slice(chapter.startBeat, chapter.endBeat + 1),
      },
      characters: fullDNA.characters
        .map(c => ({
          ...c,
          beats: c.beats
            .filter(b => b >= chapter.startBeat && b <= chapter.endBeat)
            .map(b => b - chapter.startBeat),
        }))
        .filter(c => c.beats.length > 0),
      pacing: fullDNA.pacing,
      genomeTemplate: fullDNA.genomeTemplate.slice(chapter.startBeat, chapter.endBeat + 1),
    };
    
    return chapterDNA;
  }

  /**
   * Run contact sheet selection for each beat
   */
  async runContactSheetSelection(chapter, bestGenotypes) {
    const selectedTakes = [];
    
    for (let i = 0; i < chapter.beatCount; i++) {
      const beatIndex = chapter.startBeat + i;
      console.log(`[BookPipeline] Contact sheet for Beat ${i + 1}/${chapter.beatCount} (global ${beatIndex + 1})`);
      
      // Get top genotypes for this beat
      const beatGenotypes = bestGenotypes
        .map(g => g.visual?.beatIndex === i ? g : null)
        .filter(Boolean)
        .slice(0, 8); // Top 8 for contact sheet
      
      if (!beatGenotypes.length) {
        console.warn(`  No genotypes for beat ${i}, skipping`);
        continue;
      }
      
      // Render contact sheet takes (if not already rendered)
      const takes = await this.renderContactSheetTakes(beatGenotypes, i);
      
      // Show contact sheet (UI callback)
      let selectedTake;
      if (this.contactSheet) {
        this.contactSheet.setBeat(i);
        this.contactSheet.setTakes(i, takes);
        this.contactSheet.setBeat(i);
        
        // Wait for human selection
        selected = await this.waitForSelection(i);
      } else {
        // Auto-select best by fitness
        selected = takes.reduce((best, current) => 
          (current.scores?.overall || 0) > (best.scores?.overall || 0) ? current : best
        );
      }
      
      selectedTakes.push({
        beatIndex: i,
        globalBeatIndex: beatIndex,
        selectedTake,
        alternatives: takes,
        continuityWeight: this.contactSheet?.continuityWeights?.get(i) || 0.7,
      });
    }
    
    return selectedTakes;
  }

  /**
   * Render contact sheet takes for a beat
   */
  async renderContactSheetTakes(genotypes, beatIndex) {
    const takes = [];
    
    for (const genotype of genotypes) {
      try {
        const renderResult = await this.mandalaClient.renderGenotype(genotype, {
          metadata: { title: `Beat ${beatIndex}` },
        });
        
        takes.push({
          id: `take-${genotype.id}-${Date.now()}`,
          genotypeId: genotype.id,
          genotype,
          scores: genotype.fitnessBreakdown || {},
          thumbnail: renderResult.artifact?.thumbnail,
          renderResult,
        });
      } catch (error) {
        console.warn(`Failed to render genotype ${genotype.id}:`, error.message);
      }
    }
    
    return takes;
  }

  /**
   * Wait for human selection (placeholder for UI integration)
   */
  async waitForSelection(beatIndex) {
    return new Promise((resolve) => {
      if (this.contactSheet) {
        this.contactSheet.onSelection = (take, beatIdx, weight) => {
          if (beatIdx === beatIndex) {
            resolve(take);
          }
        };
      } else {
        // Auto-resolve for headless
        setTimeout(() => resolve(this.selectedTakes[beatIndex]?.alternatives?.[0]), 100);
      }
    });
  }

  /**
   * Render final selected takes at full quality
   */
  async renderFinalTakes(chapter, selectedTakes) {
    const finalRenders = [];
    
    for (const selection of selectedTakes) {
      const { selectedTake, beatIndex } = selection;
      const genotype = selectedTake.genotype;
      
      console.log(`[BookPipeline] Rendering final for Beat ${beatIndex + 1}...`);
      
      // Upgrade quality for final render
      const finalGenotype = {
        ...genotype,
        quality: {
          ...genotype.quality,
          resolution: { width: 1920, height: 1080 },
          samplesPerPixel: 64,
          maxDepth: 8,
          denoise: true,
        },
      };
      
      const result = await this.mandalaClient.renderGenotype(finalGenotype, {
        metadata: { title: `Chapter 1 - Beat ${beatIndex + 1}` },
      });
      
      finalRenders.push({
        beatIndex,
        globalBeatIndex: chapter.startBeat + beatIndex,
        genotypeId: finalGenotype.id,
        renderResult: result,
        continuityWeight: selection.continuityWeight,
      });
    }
    
    return finalRenders;
  }

  /**
   * Assemble chapter movie from final renders
   */
  async assembleChapterMovie(chapter, finalRenders) {
    // Sort by beat order
    finalRenders.sort((a, b) => a.beatIndex - b.beatIndex);
    
    // Create assembly manifest
    const manifest = {
      title: chapter.title,
      bookTitle: this.state.bookTitle,
      chapterIndex: chapter.index,
      beats: finalRenders.map(r => ({
        beatIndex: r.beatIndex,
        genotypeId: r.genotypeId,
        artifactId: r.renderResult.artifact?.id,
        artifactPath: r.renderResult.artifact?.path,
        duration: r.renderResult.artifact?.duration,
        transition: r.continuityWeight > 0.7 ? 'cross-dissolve' : 'cut',
        continuityWeight: r.continuityWeight,
      })),
      totalDuration: finalRenders.reduce((sum, r) => sum + (r.renderResult.artifact?.duration || 0), 0),
      createdAt: new Date().toISOString(),
    };
    
    // In production: use ffmpeg to concatenate videos with transitions
    // For now, save manifest
    const manifestPath = path.join(this.workDir, `chapter_${chapter.index + 1}_manifest.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    
    return manifest;
  }

  /**
   * Save chapter result
   */
  saveChapterResult(chapterIndex, result) {
    const resultPath = path.join(this.workDir, `chapter_${chapterIndex + 1}_result.json`);
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  }

  /**
   * Process full book (all chapters)
   */
  async processBook() {
    console.log(`[BookPipeline] Processing full book: ${this.state.bookTitle}`);
    
    const results = [];
    for (let i = 0; i < this.state.chapters.length; i++) {
      try {
        const result = await this.processChapter(i);
        results.push(result);
      } catch (error) {
        console.error(`Failed to process chapter ${i + 1}:`, error);
        // Continue with next chapter
      }
    }
    
    // Assemble full book manifest
    const bookManifest = {
      title: this.state.bookTitle,
      chapters: results.map(r => ({
        chapterIndex: r.chapterIndex,
        title: r.chapterTitle,
        duration: r.chapterMovie?.totalDuration,
        beatCount: r.selectedTakes?.length,
      })),
      totalDuration: results.reduce((sum, r) => sum + (r.chapterMovie?.totalDuration || 0), 0),
      createdAt: new Date().toISOString(),
      provenanceChains: this.state.provenanceChains,
    };
    
    const manifestPath = path.join(this.workDir, 'book_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(bookManifest, null, 2));
    
    console.log(`[BookPipeline] Book processing complete: ${manifestPath}`);
    return bookManifest;
  }

  /**
   * Export final movie (manifest for video assembly)
   */
  exportMovieManifest() {
    const allRenders = this.state.chapterResults.flatMap(r => r.finalRenders || []);
    allRenders.sort((a, b) => a.globalBeatIndex - b.globalBeatIndex);
    
    return {
      title: this.state.bookTitle,
      beats: allRenders.map(r => ({
        globalBeatIndex: r.globalBeatIndex,
        chapterIndex: r.chapterIndex,
        beatIndex: r.beatIndex,
        genotypeId: r.genotypeId,
        artifactId: r.renderResult.artifact?.id,
        artifactPath: r.renderResult.artifact?.path,
        duration: r.renderResult.artifact?.duration,
        continuityWeight: r.continuityWeight,
      })),
      totalBeats: allRenders.length,
      totalDuration: allRenders.reduce((sum, r) => sum + (r.renderResult.artifact?.duration || 0), 0),
      exportedAt: new Date().toISOString(),
    };
  }
}

export default BookPipeline;