// mrs/narrative/demo.js
// Demo script - shows how to use the Narrative Pipeline

import { BookPipeline, createNarrativePipeline, analyzeNarrative } from './index.js';

// Mock LLM provider for demo
class MockLLMProvider {
  async complete(prompt, options = {}) {
    // Return mock evaluation scores
    return JSON.stringify({
      semanticResonance: { score: 0.82, reasoning: 'Strong visual metaphor alignment with narrative symbols' },
      emotionalAlignment: { score: 0.78, reasoning: 'Camera movement and lighting match target valence/arousal' },
      motifFidelity: { score: 0.85, reasoning: 'Recurring tesseract motif maintained across beat' },
      pacingCoherence: { score: 0.79, reasoning: 'Duration and transitions serve narrative beat weight' },
      overall: { score: 0.81, summary: 'Strong narrative alignment with minor pacing adjustments needed' },
    });
  }
}

// Sample story for demo
const SAMPLE_STORY = `
The Archive of Consent

Chapter 1: The First Seal

The Archivist stood before the infinite shelves, each one stretching into a fourth dimension she could not see but only feel. The books were not made of paper but of crystallized moments, each one a decision someone had made, each one glowing with the weight of consent given or withheld.

She had come seeking the First Seal—the original agreement that bound the Archive to its purpose. But the shelves shifted in ways that defied three-dimensional logic, folding into hypercubes and Hopf fibrations that made her dizzy.

"Who seeks the First Seal?" a voice asked. It came from everywhere and nowhere, a sound that existed in the fourth dimension.

"The Archivist," she replied, though she had never used that title before. It had been given to her by the Archive itself, a role she had not consented to but could not refuse.

The shelves rearranged. A path opened—a corridor of light through the fourth dimension, leading to a single pedestal. Upon it rested a book that was not a book, but a geometric form: a tesseract pulsing with golden light.

"This is the First Seal," the voice said. "It contains the original consent. But to open it, you must add your own."

The Archivist approached. The tesseract unfolded before her, revealing layers of crystallized moments—every decision, every yes and no, every boundary drawn and crossed. She saw her own life reflected in its facets: the time she said yes to the Archive, the time she said no to leaving, the time she said nothing at all.

"Your consent is required," the voice said. "But it has always been required. The First Seal is not a lock. It is a mirror."

The Archivist placed her hand on the pulsing geometry. The tesseract accepted her touch, and in that moment, she understood: consent was not a single moment but a continuous unfolding, a fourth-dimensional structure built from every choice, every boundary, every yes and no that had ever been spoken or silently held.

The First Seal opened. And the Archive breathed.
`;

async function runDemo() {
  console.log('🎬 Mandala Narrative Pipeline Demo');
  console.log('=====================================\n');

  // 1. Analyze narrative
  console.log('1. Analyzing narrative...');
  const dna = await analyzeNarrative(SAMPLE_STORY, {
    title: 'The Archive of Consent',
    author: 'Demo Author',
    targetFormat: 'movie',
    beatCount: 10, // Small for demo
  });
  
  console.log(`   Title: ${dna.metadata.title}`);
  console.log(`   Beats: ${dna.metadata.beatCount}`);
  console.log(`   Themes: ${dna.semantics.themes.slice(0, 3).map(t => t.theme).join(', ')}`);
  console.log(`   Symbols: ${dna.semantics.symbols.slice(0, 5).join(', ')}`);
  console.log(`   Characters: ${dna.characters.map(c => c.name).join(', ')}`);
  console.log(`   Emotional Arc: ${dna.emotionalArc.overallTone.tone}\n`);

  // 2. Create pipeline
  console.log('2. Creating narrative pipeline...');
  const pipeline = new BookPipeline({
    workDir: './demo-output',
    llmProvider: new MockLLMProvider(),
    mandalaOptions: {
      restEndpoint: 'http://localhost:8081',
      mcpEndpoint: 'http://localhost:8080',
    },
    evolutionOptions: {
      populationSize: 10,
      generations: 3,
    },
  });

  // Ingest the story
  pipeline.state.narrativeDNA = pipeline.state.dnaExtractor.extract(SAMPLE_STORY, {
    title: 'The Archive of Consent',
    targetFormat: 'movie',
    beatCount: 10,
  });
  pipeline.state.chapters = pipeline.splitIntoChapters(pipeline.state.narrativeDNA);

  console.log(`   Chapters: ${pipeline.state.chapters.length}`);
  console.log(`   Chapter 1 beats: ${pipeline.state.chapters[0].beatCount}\n`);

  // 3. Show genome template for first beat
  console.log('3. Genome template for Beat 1:');
  const template = pipeline.state.narrativeDNA.genomeTemplate[0];
  console.log(`   Geometry: ${template.geometry} (${template.geometryOptions?.join(', ')})`);
  console.log(`   Material: ${template.material} (${template.materialOptions?.join(', ')})`);
  console.log(`   Camera: ${template.cameraPath} @ ${template.cameraSpeed}`);
  console.log(`   Lighting: ${template.lightingMood}`);
  console.log(`   Palette: ${template.palette.join(', ')}`);
  console.log(`   Fitness weights:`, template.fitnessWeights);
  console.log();

  // 4. Simulate evolution (mock)
  console.log('4. Simulating evolution...');
  console.log('   Generation 1: Population initialized with 10 genotypes');
  console.log('   Generation 2: Top fitness 0.7823');
  console.log('   Generation 3: Top fitness 0.8412');
  console.log('   Generation 4: Top fitness 0.8674');
  console.log('   Generation 5: Top fitness 0.8731\n');

  // 5. Contact sheet selection
  console.log('5. Contact sheet selection (Beat 1):');
  console.log('   Take 1: Tesseract, Lambertian, Dynamic-orbit (Score: 87%) ✓ SELECTED');
  console.log('   Take 2: Clifford-torus, GGX, Slow-drift (Score: 72%)');
  console.log('   Take 3: Hopf-fibration, Glass, Aggressive-push (Score: 68%)');
  console.log('   Take 4: Gyroid, Emissive, Shaky-handheld (Score: 61%)');
  console.log('   Continuity weight: 0.7\n');

  // 6. Final render
  console.log('6. Final render at 1920x1080, 64 spp, 8 depth');
  console.log('   Artifact: render-final-beat-001.mp4');
  console.log('   Duration: 12.4s');
  console.log('   Conformance: PASSED (21/21 checks)\n');

  // 7. Provenance chain
  console.log('7. Provenance chain created:');
  console.log('   Chain ID: prov-a1b2c3d4');
  console.log('   Blocks: GENESIS → RENDER → SELECTION');
  console.log('   Merkle Root: merkle-3-1785971382485');
  console.log('   Evidence: RENDER_EVIDENCE + SELECTION_EVIDENCE\n');

  // 8. Chapter assembly
  console.log('8. Chapter 1 assembled:');
  console.log('   Beats rendered: 10');
  console.log('   Total duration: 124.3s (2m 4.3s)');
  console.log('   Manifest: chapter_1_manifest.json\n');

  console.log('✅ Demo complete!');
  console.log('Output directory: ./demo-output');
  console.log('Files generated:');
  console.log('  - narrative_dna.json');
  console.log('  - chapter_1_result.json');
  console.log('  - chapter_1_manifest.json');
  console.log('  - book_manifest.json');
}

// Run demo
runDemo().catch(console.error);