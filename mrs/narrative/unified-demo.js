// mrs/narrative/unified-demo.js
// Unified Demo - Mandala + Mythar Complete Integration

import { UnifiedNarrativeSystem, storyToMytharMovie, analyzeWithMythar } from './unified-integration.js';

// Mock LLM for demo
class MockLLMProvider {
  async complete(prompt, options = {}) {
    if (prompt.includes('EVALUATION') || prompt.includes('RUBRIC')) {
      return JSON.stringify({
        semanticResonance: { score: 0.84, reasoning: 'Strong alignment with Mythar root "ma" (mother/origin) and cluster 12 (pa-ti-ne family triad)' },
        emotionalAlignment: { score: 0.81, reasoning: 'Camera drift matches valence/arousal of reverence→rupture arc; lighting mood "soft-warm" matches positive valence' },
        motifFidelity: { score: 0.88, reasoning: 'Recurring tesseract geometry maps to Mythar root "to" (hand/agency) and cluster 13 (nu-si-to breath-eye-hand)' },
        pacingCoherence: { score: 0.79, reasoning: 'Duration 12.4s within target 135s; cross-dissolve transition matches emotional continuity weight 0.7' },
        overall: { score: 0.83, summary: 'Strong Mythar-aligned narrative resonance; PGC-compliant polysemy on root "fi" (intensity→purity)' },
      });
    }
    
if (prompt.includes('NARRATIVE CONTEXT') || prompt.includes('BEAT')) {
      const narrativeData = {
        structure: {
          beats: [
            { index: 0, summary: 'The Archivist stands before infinite shelves', content: 'The Archivist stood before the infinite shelves...', wordCount: 45 },
            { index: 1, summary: 'Voice from the fourth dimension', content: '"Who seeks the First Seal?" a voice asked...', wordCount: 38 },
            { index: 2, summary: 'The path opens to the First Seal', content: 'The shelves rearranged. A path opened...', wordCount: 42 },
            { index: 3, summary: 'The tesseract unfolds', content: 'The tesseract unfolded before her, revealing layers...', wordCount: 48 },
            { index: 4, summary: 'Consent as continuous unfolding', content: 'The First Seal opened. And the Archive breathed.', wordCount: 35 },
          ].slice(0, 5),
          semantics: {
            themes: [{ theme: 'memory/identity', weight: 12 }, { theme: 'power/control', weight: 8 }, { theme: 'transformation', weight: 6 }],
            symbols: ['archive', 'seal', 'tesseract', 'consent', 'fourth dimension'],
            motifs: ['crystallized moments', 'infinite shelves', 'fourth dimension', 'golden light'],
            keyPhrases: ['First Seal', 'crystallized moments', 'continuous unfolding', 'Archive breathed'],
            tone: [{ tone: 'mysterious', weight: 8 }, { tone: 'somber', weight: 6 }, { tone: 'hopeful', weight: 4 }],
          },
          visualMotifs: [
            { sourceTheme: 'memory/identity', geometries: ['clifford-torus', 'hopf-fibration'], materials: ['glass', 'mirror'], palette: ['#1a1a2e', '#16213e', '#0f3460', '#e94560'] },
            { sourceTheme: 'transformation', geometries: ['morphing-tesseract', 'flow-gyroid'], materials: ['liquid-metal', 'iridescent'], palette: ['#1b1b2f', '#2d2d44', '#8b8bb8', '#d4d4f0'] },
          ],
          emotionalArc: {
            beats: [
              { index: 0, valence: 0.1, arousal: 0.3, primaryEmotion: 'calm' },
              { index: 1, valence: -0.2, arousal: 0.6, primaryEmotion: 'fear' },
              { index: 2, valence: 0.3, arousal: 0.7, primaryEmotion: 'wonder' },
              { index: 3, valence: 0.5, arousal: 0.8, primaryEmotion: 'excitement' },
              { index: 4, valence: 0.7, arousal: 0.4, primaryEmotion: 'contentment' },
            ],
            turningPoints: [{ beatIndex: 1, type: 'valence-turn' }, { beatIndex: 3, type: 'arousal-peak' }],
            overallTone: { tone: 'hopeful-energetic', avgValence: 0.28, avgArousal: 0.56 },
          },
          characters: [
            { name: 'The Archivist', mentions: 5, beats: [0, 1, 2, 3, 4] },
            { name: 'First Seal', mentions: 3, beats: [1, 2, 3] },
            { name: 'Archive', mentions: 4, beats: [0, 1, 4] },
          ],
          pacing: {
            beatCount: 5,
            totalTargetDuration: 5400,
            targetBeatDuration: 1080,
          },
          genomeTemplate: [
            { geometry: 'clifford-torus', cameraPath: 'slow-drift', lightingMood: 'soft-warm', fitnessWeights: { visualFidelity: 0.25, narrativeAlignment: 0.35, emotionalResonance: 0.25, technicalQuality: 0.15 } },
            { geometry: 'tesseract', cameraPath: 'dynamic-orbit', lightingMood: 'bright-dramatic', fitnessWeights: { visualFidelity: 0.25, narrativeAlignment: 0.35, emotionalResonance: 0.25, technicalQuality: 0.15 } },
            { geometry: 'hopf-fibration', cameraPath: 'standard-orbit', lightingMood: 'neutral-balanced', fitnessWeights: { visualFidelity: 0.25, narrativeAlignment: 0.35, emotionalResonance: 0.25, technicalQuality: 0.15 } },
            { geometry: 'morphing-tesseract', cameraPath: 'dynamic-orbit', lightingMood: 'bright-dramatic', fitnessWeights: { visualFidelity: 0.25, narrativeAlignment: 0.35, emotionalResonance: 0.25, technicalQuality: 0.15 } },
            { geometry: 'unfolding-hypercube', cameraPath: 'rising-crane', lightingMood: 'golden-hour', fitnessWeights: { visualFidelity: 0.25, narrativeAlignment: 0.35, emotionalResonance: 0.25, technicalQuality: 0.15 } },
          ],
        }
      };
      return JSON.stringify(narrativeData);
    }
  
  // Default for narrative text generation
    return `The ${Math.random() > 0.5 ? 'Archive' : 'tesseract'} ${Math.random() > 0.5 ? 'breathes' : 'unfolds'} in the ${Math.random() > 0.5 ? 'fourth dimension' : 'golden light'}, a ${Math.random() > 0.5 ? 'testament' : 'witness'} to the ${Math.random() > 0.5 ? 'weight of consent' : 'unfolding of time'}.`;
  }
}

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

async function runUnifiedDemo() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  UNIFIED NARRATIVE SYSTEM DEMO                                 ║');
  console.log('║  Mandala Narrative Pipeline + Mythar Constitutional Engine     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // 1. Initialize unified system
  console.log('1️⃣  INITIALIZING UNIFIED SYSTEM\n');
  const system = await UnifiedNarrativeSystem.createUnifiedNarrativeSystem({
    workDir: './unified-demo-output',
    enableMythar: true,
    llmProvider: new MockLLMProvider(),
  });
  
  console.log('\n   System Status:', system.getSystemStatus());
  console.log('   Mythar Roots:', system.mytharLexicon?.cache?.roots?.length || 'embedded');
  console.log('   Mythar Clusters:', system.mytharLexicon?.cache?.clusters?.length || 'embedded');
  console.log('   PGC Rules:', system.mytharIntegration?.pgcContractCache?.contract?.length || 'embedded');

  // 2. Analyze narrative with Mythar enrichment
  console.log('\n2️⃣  ANALYZING NARRATIVE WITH MYTHAR ENRICHMENT\n');
  const enhancedDNA = await system.analyzeNarrative(SAMPLE_STORY, {
    title: 'The Archive of Consent',
    beatCount: 5,
  });
  
  console.log('   Title:', enhancedDNA.metadata.title);
  console.log('   Beats:', enhancedDNA.metadata.beatCount);
  console.log('   Themes:', enhancedDNA.semantics.themes.slice(0,3).map(t => t.theme).join(', '));
  console.log('   Symbols:', enhancedDNA.semantics.symbols.slice(0,5).join(', '));
  console.log('   Characters:', enhancedDNA.characters.map(c => c.name).join(', '));
  
  console.log('\n   🏛️ Mythar Root Motifs (top 3):');
  enhancedDNA.mytharRootMotifs?.slice(0,3).forEach((m, i) => {
    console.log(`   ${i+1}. "${m.semanticElement}" → ${m.mytharRoots[0]?.form} (${m.mytharRoots[0]?.gloss}) [conf: ${m.confidence.toFixed(2)}]`);
  });
  
  console.log('\n   🏛️ Mythar Cluster Genomes (top 2):');
  enhancedDNA.mytharClusterGenomes?.slice(0,2).forEach((c, i) => {
    console.log(`   ${i+1}. Cluster ${c.mytharClusters[0]?.cluster_id}: ${c.mytharClusters[0]?.name} (${c.mytharClusters[0]?.domain})`);
    console.log(`      Geometry: ${c.genomeParams.geometry}, Material: ${c.genomeParams.material}`);
    console.log(`      Camera: ${c.genomeParams.cameraPath} @ ${c.genomeParams.cameraSpeed}`);
  });

  // 3. Story → Mythar Movie
  console.log('\n3️⃣  STORY → MYTHAR MOVIE\n');
  const movieResult = await storyToMytharMovie(SAMPLE_STORY, {
    workDir: './unified-demo-output',
    title: 'The Archive of Consent',
    beatCount: 5,
  });
  
  console.log('   Narrative DNA enhanced:', movieResult.mytharEnhanced);
  console.log('   Chapter result:', !!movieResult.chapterResult);
  console.log('   Movie manifest:', !!movieResult.movieManifest);
  
  if (movieResult.chapterResult) {
    console.log('   Selected takes:', movieResult.chapterResult.selectedTakes?.length);
    console.log('   Final renders:', movieResult.chapterResult.finalRenders?.length);
    console.log('   Chapter duration:', movieResult.chapterResult.chapterMovie?.totalDuration + 's');
  }

  // 4. Mythar Registry check
  console.log('\n4️⃣  MYTHAR REGISTRY\n');
  const candidates = await system.mytharRegistry.listCandidates({ type: 'narrative_genotype' });
  console.log('   Registered genotypes:', candidates.length);
  candidates.slice(0,3).forEach(c => {
    console.log(`   - ${c.registryId}: ${c.title}`);
  });

  // 5. Governance check
  console.log('\n5️⃣  MYTHAR GOVERNANCE\n');
  if (system.mytharGovernance) {
    const governanceRecord = await system.mytharGovernance.createPipelineGovernance(
      { id: 'test-genotype-1', visual: { geometry: 'tesseract', material: 'glass' } },
      { metadata: { title: 'Test' } }
    );
    console.log('   Governance record created:', governanceRecord.identity);
    console.log('   Assurance level:', governanceRecord.assurance_level);
    console.log('   PGC compliance:', governanceRecord.extra?.pgc_compliance);
  }

  // 6. Mythar Transducers
  console.log('\n6️⃣  MYTHAR TRANSDUCERS (Narrative Generation)\n');
  const generated = await system.mytharTransducers.generateText({
    morphemes: [
      { form: 'ma', type: 'root' },
      { form: 'ti', type: 'root' },
      { form: 'la', type: 'root' },
      { form: 'kra', type: 'root' },
    ],
    blueprint: 'The Archive of Consent',
  }, { style: 'mythic' });
  
  console.log('   Generated:', generated.text);
  console.log('   Morphemes used:', generated.morphemesUsed.join(', '));

  // 7. Unified Manifest
  console.log('\n7️⃣  UNIFIED MANIFEST\n');
  const manifest = system.generateUnifiedManifest();
  console.log('   Version:', manifest.version);
  console.log('   Contracts:', Object.keys(manifest.contracts).join(', '));
  console.log('   Compliance:', manifest.compliance);
  console.log('   Mandala beats:', manifest.mandala.totalBeats);
  console.log('   Mythar roots used:', manifest.mythar.lexicon.rootsUsed);

  // 8. Export
  console.log('\n8️⃣  EXPORTING ARTIFACTS\n');
  await system.exportAll('./unified-demo-output');
  
  console.log('\n✅ UNIFIED DEMO COMPLETE');
  console.log('   Output: ./unified-demo-output/');
  console.log('   Files: unified_manifest.json, book_manifest.json, mythar_manifest.json, chapter_1_result.json, provenance_chains.json');
}

runUnifiedDemo().catch(console.error);