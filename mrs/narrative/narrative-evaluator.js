// mrs/narrative/narrative-evaluator.js
// Narrative Evaluator - LLM + human-in-the-loop scoring for NFC compliance

import { z } from 'zod';

export class NarrativeEvaluator {
  constructor(options = {}) {
    this.llmProvider = options.llmProvider;
    this.humanReviewEnabled = options.humanReviewEnabled !== false;
    this.humanReviewThreshold = options.humanReviewThreshold || 0.7; // Scores below this trigger human review
    this.evaluationTimeout = options.evaluationTimeout || 30000;
    
    // Evaluation rubrics (NFC compliant)
    this.rubrics = {
      semanticResonance: {
        weight: 0.3,
        criteria: [
          'Visual elements directly represent narrative symbols/motifs',
          'Color palette reflects narrative tone and themes',
          'Geometry choice serves narrative metaphor',
          'Composition reinforces key narrative moments',
        ],
      },
      emotionalAlignment: {
        weight: 0.3,
        criteria: [
          'Valence/arousal matches beat emotional target',
          'Camera movement reflects emotional state',
          'Lighting mood supports emotional valence',
          'Pacing matches emotional arousal level',
        ],
      },
      motifFidelity: {
        weight: 0.2,
        criteria: [
          'Recurring visual motifs appear consistently',
          'Symbolic elements are visually recognizable',
          'Character visual anchors maintained',
          'Setting matches narrative locations',
        ],
      },
      pacingCoherence: {
        weight: 0.2,
        criteria: [
          'Shot duration matches narrative beat weight',
          'Transitions serve narrative flow',
          'Temporal rhythm matches emotional arc',
          'Frame rate supports motion quality',
        ],
      },
    };
    
    // Human review queue
    this.reviewQueue = [];
  }

  /**
   * Evaluate a render artifact against narrative DNA
   * @param {object} artifact - Render result from Mandala
   * @param {object} genome - PipelineGenotype that produced it
   * @param {object} blueprint - Narrative DNA blueprint
   * @param {object} beat - Beat context
   * @returns {Promise<object>} Narrative fitness scores
   */
  async evaluate(artifact, genome, blueprint, beat) {
    // Run LLM evaluation
    const llmScores = await this.llmEvaluate(artifact, genome, blueprint, beat);
    
    // Compute automatic metrics
    const autoScores = this.computeAutoMetrics(artifact, genome, blueprint, beat);
    
    // Combine scores
    const combined = this.combineScores(llmScores, autoScores);
    
    // Check if human review needed
    const needsReview = this.needsHumanReview(combined);
    
    if (needsReview && this.humanReviewEnabled) {
      const humanScores = await this.requestHumanReview(artifact, genome, blueprint, beat, combined);
      return this.finalizeScores(humanScores, combined);
    }
    
    return this.finalizeScores(llmScores, combined);
  }

  /**
   * LLM-based narrative evaluation
   */
  async llmEvaluate(artifact, genome, blueprint, beat) {
    if (!this.llmProvider) {
      return this.getDefaultLLMScores();
    }
    
    const prompt = this.buildEvaluationPrompt(artifact, genome, blueprint, beat);
    
    try {
      const response = await this.llmProvider.complete(prompt, {
        temperature: 0.1,
        maxTokens: 2000,
        responseFormat: 'json',
        timeout: this.evaluationTimeout,
      });
      
      return this.parseLLMResponse(response);
    } catch (error) {
      console.warn('LLM evaluation failed:', error.message);
      return this.getDefaultLLMScores();
    }
  }

  /**
   * Build evaluation prompt for LLM
   */
  buildEvaluationPrompt(artifact, genome, blueprint, beat) {
    return `
You are a narrative visual evaluator for the Mandala Rendering System.
Evaluate how well this render serves the narrative intent.

NARRATIVE CONTEXT:
- Beat: ${beat.index} - ${beat.summary || 'N/A'}
- Target Emotion: ${genome.emotional.primaryEmotion} (valence: ${genome.emotional.valence}, arousal: ${genome.emotional.arousal})
- Key Symbols: ${genome.semantic.symbols.join(', ') || 'none'}
- Motifs: ${genome.semantic.motifs.join(', ') || 'none'}
- Narrative Themes: ${blueprint.semantics?.themes?.map(t => t.theme).join(', ') || 'none'}

RENDER SPECIFICATION:
- Geometry: ${genome.visual.geometry}
- Material: ${genome.visual.material}
- Palette: ${genome.visual.palette.join(', ')}
- Camera: ${genome.visual.cameraPath} at ${genome.visual.cameraSpeed} speed
- Lighting: ${genome.visual.lightingMood}
- Duration: ${genome.temporal.duration}s
- Transition: ${genome.temporal.transitionType}

EVALUATION RUBRIC:
Score each dimension 0-1 with reasoning:

1. SEMANTIC RESONANCE (${this.rubrics.semanticResonance.weight * 100}%)
${this.rubrics.semanticResonance.criteria.map((c, i) => `${i+1}. ${c}`).join('\n')}

2. EMOTIONAL ALIGNMENT (${this.rubrics.emotionalAlignment.weight * 100}%)
${this.rubrics.emotionalAlignment.criteria.map((c, i) => `${i+1}. ${c}`).join('\n')}

3. MOTIF FIDELITY (${this.rubrics.motifFidelity.weight * 100}%)
${this.rubrics.motifFidelity.criteria.map((c, i) => `${i+1}. ${c}`).join('\n')}

4. PACING COHERENCE (${this.rubrics.pacingCoherence.weight * 100}%)
${this.rubrics.pacingCoherence.criteria.map((c, i) => `${i+1}. ${c}`).join('\n')}

Return JSON:
{
  "semanticResonance": {"score": 0.0-1.0, "reasoning": "..."},
  "emotionalAlignment": {"score": 0.0-1.0, "reasoning": "..."},
  "motifFidelity": {"score": 0.0-1.0, "reasoning": "..."},
  "pacingCoherence": {"score": 0.0-1.0, "reasoning": "..."},
  "overall": {"score": 0.0-1.0, "summary": "..."}
}
`;
  }

  /**
   * Parse LLM response
   */
  parseLLMResponse(response) {
    try {
      const parsed = typeof response === 'string' ? JSON.parse(response) : response;
      
      // Validate structure
      const required = ['semanticResonance', 'emotionalAlignment', 'motifFidelity', 'pacingCoherence'];
      for (const key of required) {
        if (!parsed[key] || typeof parsed[key].score !== 'number') {
          parsed[key] = { score: 0.5, reasoning: 'LLM response parsing failed' };
        }
        parsed[key].score = Math.max(0, Math.min(1, parsed[key].score));
      }
      
      return parsed;
    } catch (error) {
      console.warn('LLM response parse failed:', error.message);
      return this.getDefaultLLMScores();
    }
  }

  /**
   * Compute automatic metrics from artifact data
   */
  computeAutoMetrics(artifact, genome, blueprint, beat) {
    return {
      // Technical quality from render
      frameConsistency: artifact.frameConsistency || 0.85,
      resolutionCompliance: artifact.resolutionCompliance || 1.0,
      frameRateStability: artifact.frameRateStability || 0.9,
      
      // Visual alignment (computed)
      geometryMatch: this.checkGeometryMatch(genome.visual.geometry, blueprint),
      materialMatch: this.checkMaterialMatch(genome.visual.material, blueprint),
      paletteSimilarity: this.computePaletteSimilarity(genome.visual.palette, blueprint),
      
      // Temporal compliance
      durationCompliance: this.checkDurationCompliance(artifact, genome.temporal),
      frameRateCompliance: artifact.frameRateCompliance || 1.0,
      
      // Narrative genome alignment
      symbolCoverage: this.computeSymbolCoverage(genome, blueprint),
      motifCoverage: this.computeMotifCoverage(genome, blueprint),
      emotionalAlignmentAuto: this.computeEmotionalAlignmentAuto(genome, beat),
    };
  }

  /**
   * Combine LLM and automatic scores
   */
  combineScores(llmScores, autoScores) {
    const weights = { llm: 0.7, auto: 0.3 };
    
    return {
      semanticResonance: weights.llm * llmScores.semanticResonance.score + weights.auto * this.deriveSemanticFromAuto(autoScores),
      emotionalAlignment: weights.llm * llmScores.emotionalAlignment.score + weights.auto * this.deriveEmotionalFromAuto(autoScores),
      motifFidelity: weights.llm * llmScores.motifFidelity.score + weights.auto * this.deriveMotifFromAuto(autoScores),
      pacingCoherence: weights.llm * llmScores.pacingCoherence.score + weights.auto * this.derivePacingFromAuto(autoScores),
    };
  }

  /**
   * Check if human review needed
   */
  needsHumanReview(scores) {
    // Below threshold on any dimension
    if (scores.semanticResonance < this.humanReviewThreshold) return true;
    if (scores.emotionalAlignment < this.humanReviewThreshold) return true;
    if (scores.motifFidelity < this.humanReviewThreshold) return true;
    if (scores.pacingCoherence < this.humanReviewThreshold) return true;
    
    // High variance between dimensions suggests inconsistency
    const values = Object.values(scores);
    const variance = this.computeVariance(values);
    if (variance > 0.15) return true;
    
    return false;
  }

  /**
   * Request human review via UI callback
   */
  async requestHumanReview(artifact, genome, blueprint, beat, combinedScores) {
    // In production: this would trigger a UI notification
    // For now: return combined scores with review flag
    
    const reviewItem = {
      id: `review-${Date.now()}`,
      artifact,
      genome,
      blueprint,
      beat,
      combinedScores,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };
    
    this.reviewQueue.push(reviewItem);
    
    // In real implementation, this would wait for human input
    // For now, return combined scores with slightly adjusted confidence
    return {
      ...combinedScores,
      humanReviewed: false,
      reviewPending: true,
      confidence: 0.8,
    };
  }

  /**
   * Finalize scores for NFC output
   */
  finalizeScores(llmScores, combinedScores) {
    const finalScores = {
      semanticResonance: combinedScores.semanticResonance,
      emotionalAlignment: combinedScores.emotionalAlignment,
      motifFidelity: combinedScores.motifFidelity,
      pacingCoherence: combinedScores.pacingCoherence,
      
      // Overall weighted score
      overall: 
        combinedScores.semanticResonance * 0.3 +
        combinedScores.emotionalAlignment * 0.3 +
        combinedScores.motifFidelity * 0.2 +
        combinedScores.pacingCoherence * 0.2,
      
      // Metadata
      evaluationMethod: 'llm+auto',
      evaluatedAt: new Date().toISOString(),
    };
    
    return finalScores;
  }

  // Helper methods
  getDefaultLLMScores() {
    return {
      semanticResonance: { score: 0.6, reasoning: 'Default score - LLM unavailable' },
      emotionalAlignment: { score: 0.6, reasoning: 'Default score - LLM unavailable' },
      motifFidelity: { score: 0.6, reasoning: 'Default score - LLM unavailable' },
      pacingCoherence: { score: 0.7, reasoning: 'Default score - LLM unavailable' },
    };
  }

  deriveSemanticFromAuto(auto) {
    return (auto.symbolCoverage * 0.4 + auto.motifCoverage * 0.3 + auto.geometryMatch * 0.3);
  }

  deriveEmotionalFromAuto(auto) {
    return (auto.emotionalAlignmentAuto * 0.6 + auto.paletteSimilarity * 0.4);
  }

  deriveMotifFromAuto(auto) {
    return (auto.motifCoverage * 0.5 + auto.materialMatch * 0.3 + auto.geometryMatch * 0.2);
  }

  derivePacingFromAuto(auto) {
    return (auto.durationCompliance * 0.5 + auto.frameRateCompliance * 0.3 + auto.frameRateStability * 0.2);
  }

  // Auto metric helpers
  checkGeometryMatch(geometry, blueprint) {
    const target = blueprint.visualMotifs?.[0]?.geometries?.[0];
    return geometry === target ? 1 : 0.5;
  }

  checkMaterialMatch(material, blueprint) {
    const target = blueprint.visualMotifs?.[0]?.materials?.[0];
    return material === target ? 1 : 0.5;
  }

  computePaletteSimilarity(palette, blueprint) {
    const target = blueprint.visualMotifs?.[0]?.palette || [];
    if (!target.length) return 0.5;
    
    const set1 = new Set(palette.map(c => c.toLowerCase()));
    const set2 = new Set(target.map(c => c.toLowerCase()));
    const intersection = [...set1].filter(x => set2.has(x)).length;
    return intersection / Math.max(set1.size, set2.size);
  }

  checkDurationCompliance(artifact, temporal) {
    const actual = artifact.duration || temporal.duration;
    const target = temporal.duration;
    const diff = Math.abs(actual - target) / target;
    return Math.max(0, 1 - diff);
  }

  computeSymbolCoverage(genome, blueprint) {
    const blueprintSymbols = blueprint.semantics?.symbols || [];
    const genomeSymbols = genome.semantic?.symbols || [];
    if (!blueprintSymbols.length) return 1;
    return genomeSymbols.filter(s => blueprintSymbols.includes(s)).length / blueprintSymbols.length;
  }

  computeMotifCoverage(genome, blueprint) {
    const blueprintMotifs = blueprint.semantics?.motifs?.map(m => m.motif) || [];
    const genomeMotifs = genome.semantic?.motifs || [];
    if (!blueprintMotifs.length) return 1;
    return genomeMotifs.filter(m => blueprintMotifs.includes(m)).length / blueprintMotifs.length;
  }

  computeEmotionalAlignmentAuto(genome, beat) {
    if (!beat?.valence) return 0.5;
    const valenceDiff = Math.abs(genome.emotional.valence - beat.valence);
    const arousalDiff = Math.abs(genome.emotional.arousal - beat.arousal);
    return 1 - (valenceDiff + arousalDiff) / 2;
  }

  computeVariance(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length;
  }
}

export default NarrativeEvaluator;