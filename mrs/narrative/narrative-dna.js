// mrs/narrative/narrative-dna.js
// Narrative DNA Extractor - parses book/story into structured narrative DNA

export class NarrativeDNAExtractor {
  constructor(options = {}) {
    this.llmProvider = options.llmProvider || null;
    this.chunkSize = options.chunkSize || 3000; // tokens
  }

  /**
   * Extract narrative DNA from text (book, story, prompt)
   * @param {string} text - Full text content
   * @param {object} options - Extraction options
   * @returns {Promise<NarrativeDNA>}
   */
  async extract(text, options = {}) {
    const {
      title = options.title || 'Untitled',
      author = options.author || 'Unknown',
      targetFormat = options.targetFormat || 'movie', // movie, series, shorts
      beatCount = options.beatCount || 40,
    } = options;

    // Stage 1: Structural analysis
    const structure = await this.analyzeStructure(text, beatCount);
    
    // Stage 2: Semantic extraction
    const semantics = await this.extractSemantics(text, structure);
    
    // Stage 3: Visual motif derivation
    const visualMotifs = await this.deriveVisualMotifs(semantics, structure);
    
    // Stage 4: Emotional arc mapping
    const emotionalArc = await this.mapEmotionalArc(text, structure);
    
    // Stage 5: Character & entity anchoring
    const characters = await this.extractCharacters(text, structure);
    
    // Stage 6: Temporal/pacing analysis
    const pacing = await this.analyzePacing(text, structure, targetFormat);

    return {
      metadata: {
        title,
        author,
        extractedAt: new Date().toISOString(),
        sourceLength: text.length,
        targetFormat,
        beatCount: structure.beats.length,
      },
      structure,
      semantics,
      visualMotifs,
      emotionalArc,
      characters,
      pacing,
      genomeTemplate: this.buildGenomeTemplate(structure, visualMotifs, emotionalArc, pacing),
    };
  }

  async analyzeStructure(text, targetBeats) {
    // Split into candidate beats using multiple strategies
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 50);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    // Use LLM if available, otherwise heuristic
    if (this.llmProvider) {
      return await this.llmAnalyzeStructure(text, targetBeats);
    }
    
    // Heuristic: distribute beats across text
    const beats = [];
    const beatSize = Math.max(1, Math.floor(paragraphs.length / targetBeats));
    
    for (let i = 0; i < targetBeats; i++) {
      const start = i * beatSize;
      const end = Math.min(start + beatSize, paragraphs.length);
      const content = paragraphs.slice(start, end).join('\n\n');
      
      if (content.trim().length < 100) continue;
      
      beats.push({
        index: beats.length,
        content: content.substring(0, 2000), // truncate for storage
        startParagraph: start,
        endParagraph: end,
        wordCount: content.split(/\s+/).length,
      });
    }
    
    return {
      totalParagraphs: paragraphs.length,
      totalSentences: sentences.length,
      estimatedWordCount: text.split(/\s+/).length,
      beats,
    };
  }

  async llmAnalyzeStructure(text, targetBeats) {
    const prompt = `
Analyze this text and identify ${targetBeats} narrative beats for visual adaptation.
Return JSON with: beats array [{index, summary, keyEvents, emotionalValence, visualKeywords, estimatedDuration}]
Text: ${text.substring(0, 15000)}
`;
    
    try {
      const response = await this.llmProvider.complete(prompt, { 
        temperature: 0.3, 
        maxTokens: 4000,
        responseFormat: 'json'
      });
      return JSON.parse(response);
    } catch (e) {
      console.warn('LLM structure analysis failed, falling back to heuristic:', e.message);
      return this.analyzeStructure(text, targetBeats);
    }
  }

  async extractSemantics(text, structure) {
    const themes = this.extractThemes(text);
    const symbols = this.extractSymbols(text);
    const motifs = this.extractRecurringMotifs(text);
    const tone = this.analyzeTone(text);
    
    return {
      themes,
      symbols,
      motifs,
      tone,
      keyPhrases: this.extractKeyPhrases(text, 20),
    };
  }

  extractThemes(text) {
    const themeKeywords = {
      'memory/identity': ['memory', 'remember', 'forgot', 'identity', 'self', 'who am i'],
      'power/control': ['power', 'control', 'authority', 'command', 'rule', 'dominion'],
      'love/connection': ['love', 'connection', 'bond', 'relationship', 'together', 'apart'],
      'loss/grief': ['loss', 'grief', 'gone', 'missing', 'absence', 'void', 'empty'],
      'discovery/revelation': ['discover', 'reveal', 'truth', 'secret', 'hidden', 'uncover'],
      'transformation': ['change', 'transform', 'become', 'evolve', 'metamorphosis', 'shift'],
      'conflict/struggle': ['fight', 'struggle', 'conflict', 'battle', 'war', 'resistance'],
      'technology/future': ['technology', 'machine', 'ai', 'digital', 'virtual', 'synthetic'],
      'nature/organic': ['nature', 'organic', 'grow', 'life', 'natural', 'living', 'breath'],
      'time/mortality': ['time', 'eternal', 'moment', 'forever', 'mortal', 'death', 'age'],
      'freedom/confinement': ['free', 'freedom', 'trap', 'cage', 'prison', 'bound', 'liberat'],
    };
    
    const lower = text.toLowerCase();
    const scores = {};
    
    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      scores[theme] = keywords.reduce((sum, kw) => sum + (lower.split(kw).length - 1), 0);
    }
    
    return Object.entries(scores)
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([theme, score]) => ({ theme, weight: score }));
  }

  extractSymbols(text) {
    const symbolPatterns = [
      /(?:the|a|an)\s+([a-z]+)\s+(?:was|is|became|seemed|looked like)\s+a\s+(?:symbol|metaphor|sign|representation)\s+of/gi,
      /(?:symbol|metaphor|emblem|token|icon)\s+(?:of|for)\s+([^.!?]+)/gi,
      /(?:represented|symbolized|embodied|manifested)\s+(?:by|as|through)\s+([^.!?]+)/gi,
    ];
    
    const symbols = new Set();
    for (const pattern of symbolPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) symbols.add(match[1].trim().toLowerCase());
      }
    }
    
    return Array.from(symbols).slice(0, 20);
  }

  extractRecurringMotifs(text) {
    const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const freq = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    
    return Object.entries(freq)
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([motif, count]) => ({ motif, frequency: count }));
  }

  analyzeTone(text) {
    const toneMarkers = {
      somber: ['dark', 'shadow', 'grim', 'bleak', 'heavy', 'burden', 'sorrow', 'mourn'],
      hopeful: ['light', 'hope', 'dawn', 'rise', 'promise', 'future', 'bright', 'new'],
      tense: ['tension', 'tight', 'edge', 'danger', 'threat', 'urgent', 'press', 'strain'],
      peaceful: ['calm', 'peace', 'still', 'quiet', 'serene', 'gentle', 'soft', 'rest'],
      mysterious: ['mystery', 'unknown', 'secret', 'hidden', 'veil', 'obscure', 'enigma', 'cryptic'],
      clinical: ['data', 'analysis', 'measure', 'calculate', 'precise', 'exact', 'system', 'protocol'],
      poetic: ['whisper', 'dance', 'flow', 'drift', 'float', 'ethereal', 'luminous', 'radiant'],
      brutal: ['blood', 'bone', 'break', 'shatter', 'crush', 'tear', 'rip', 'violent', 'savage'],
    };
    
    const lower = text.toLowerCase();
    const scores = {};
    
    for (const [tone, markers] of Object.entries(toneMarkers)) {
      scores[tone] = markers.reduce((sum, m) => sum + (lower.split(m).length - 1), 0);
    }
    
    return Object.entries(scores)
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tone, score]) => ({ tone, weight: score }));
  }

  extractKeyPhrases(text, count) {
    // Simple TF-IDF-like extraction
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 30);
    const scored = sentences.map(s => ({
      phrase: s.trim(),
      score: this.scorePhrase(s, text),
    }));
    
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(({ phrase }) => phrase);
  }

  scorePhrase(sentence, fullText) {
    const words = sentence.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const uniqueWords = new Set(words);
    let score = uniqueWords.size;
    
    // Boost for rare words
    for (const w of uniqueWords) {
      const freq = (fullText.toLowerCase().match(new RegExp(`\\b${w}\\b`, 'g')) || []).length;
      score += 1 / Math.log(freq + 1);
    }
    
    return score;
  }

  async deriveVisualMotifs(semantics, structure) {
    const motifMap = {
      // Theme → visual geometry/material suggestions
      'memory/identity': { geometries: ['clifford-torus', 'hopf-fibration'], materials: ['glass', 'mirror', 'lambertian-dust'] },
      'power/control': { geometries: ['tesseract', 'hypercube'], materials: ['metal', 'obsidian', 'ggx-polished'] },
      'love/connection': { geometries: ['hopf-fibration', 'linked-rings'], materials: ['warm-glass', 'gold', 'subsurface'] },
      'loss/grief': { geometries: ['gyroid', 'fractured-cube'], materials: ['charcoal', 'matte-stone', 'absorbing'] },
      'discovery/revelation': { geometries: ['unfolding-hypercube', 'blooming-gyroid'], materials: ['crystalline', 'prism', 'emissive'] },
      'transformation': { geometries: ['morphing-tesseract', 'flow-gyroid'], materials: ['liquid-metal', 'iridescent', 'phase-shift'] },
      'conflict/struggle': { geometries: ['clashing-tetrahedra', 'stressed-gyroid'], materials: ['fractured', 'emissive-cracks', 'lava'] },
      'technology/future': { geometries: ['recursive-cube', 'data-gyroid'], materials: ['holographic', 'wireframe', 'neon-emissive'] },
      'nature/organic': { geometries: ['organic-gyroid', 'growing-torus'], materials: ['subsurface-skin', 'chlorophyll', 'bark'] },
      'time/mortality': { geometries: ['hourglass-torus', 'entropy-cube'], materials: ['sand', 'rust', 'decaying'] },
      'freedom/confinement': { geometries: ['breaking-cube', 'expanding-torus'], materials: ['shattering-glass', 'light-rays', 'open-space'] },
    };
    
    const visualMotifs = [];
    
    for (const { theme, weight } of semantics.themes.slice(0, 5)) {
      const mapping = motifMap[theme] || {};
      if (mapping.geometries) {
        visualMotifs.push({
          sourceTheme: theme,
          weight,
          geometries: mapping.geometries,
          materials: mapping.materials || ['lambertian'],
          palette: this.themeToPalette(theme),
        });
      }
    }
    
    // Add symbol-derived motifs
    for (const symbol of semantics.symbols.slice(0, 10)) {
      visualMotifs.push({
        sourceSymbol: symbol,
        weight: 1.0,
        geometries: this.symbolToGeometry(symbol),
        materials: ['symbolic', 'emissive'],
        palette: this.symbolToPalette(symbol),
      });
    }
    
    return visualMotifs;
  }

  themeToPalette(theme) {
    const palettes = {
      'memory/identity': ['#1a1a2e', '#16213e', '#0f3460', '#e94560', '#ffffff'],
      'power/control': ['#0d0d0d', '#1a1a1a', '#2d2d2d', '#ffd700', '#ffffff'],
      'love/connection': ['#2c1810', '#4a1c2e', '#8b2d4e', '#d46b8a', '#ffebee'],
      'loss/grief': ['#0a0a0a', '#1c1c1c', '#2d2d2d', '#4a4a4a', '#808080'],
      'discovery/revelation': ['#0d1b2a', '#1b263b', '#415a77', '#778da9', '#e0e1dd'],
      'transformation': ['#1b1b2f', '#2d2d44', '#4a4a6a', '#8b8bb8', '#d4d4f0'],
      'conflict/struggle': ['#1a0a0a', '#2d1414', '#4a1c1c', '#8b2d2d', '#ff4444'],
      'technology/future': ['#0a0f1a', '#12203a', '#1a3a5c', '#00d4ff', '#ffffff'],
      'nature/organic': ['#0d1f0d', '#1a3d1a', '#2d5a2d', '#4ade80', '#f0fff0'],
      'time/mortality': ['#1a1a1a', '#2d2d2d', '#4a4a4a', '#c0a060', '#f5f5dc'],
      'freedom/confinement': ['#0d1a0d', '#1a3d1a', '#2d5a2d', '#8fff8f', '#ffffff'],
    };
    return palettes[theme] || ['#0a0a0a', '#1a1a1a', '#2d2d2d', '#4a4a4a', '#ffffff'];
  }

  symbolToGeometry(symbol) {
    const geometryMap = {
      'key': ['unfolding-cube', 'tesseract-key'],
      'door': ['portal-torus', 'hyperbolic-door'],
      'chain': ['linked-tori', 'chain-gyroid'],
      'mirror': ['mirror-cube', 'reflective-torus'],
      'light': ['emissive-sphere', 'ray-cube'],
      'shadow': ['absorbing-cube', 'void-torus'],
      'fire': ['flame-gyroid', 'burning-tesseract'],
      'water': ['flow-torus', 'liquid-cube'],
      'tree': ['branching-gyroid', 'organic-torus'],
      'bird': ['flight-path', 'soaring-torus'],
      'clock': ['hourglass-torus', 'time-cube'],
      'book': ['unfolding-pages', 'knowledge-cube'],
      'eye': ['lens-torus', 'observing-sphere'],
      'heart': ['pulsing-gyroid', 'heart-torus'],
      'crown': ['spire-cube', 'corona-torus'],
    };
    return geometryMap[symbol.toLowerCase()] || ['symbolic-gyroid', 'emblem-cube'];
  }

  symbolToPalette(symbol) {
    const palettes = {
      'key': ['#1a1a2e', '#ffd700', '#ffffff'],
      'door': ['#0d1b2a', '#415a77', '#e0e1dd'],
      'chain': ['#0a0a0a', '#2d2d2d', '#808080'],
      'mirror': ['#0f0f0f', '#2d2d2d', '#ffffff'],
      'light': ['#fff8e1', '#ffeb3b', '#ffffff'],
      'shadow': ['#050505', '#1a1a1a', '#4a4a4a'],
      'fire': ['#1a0a0a', '#ff4400', '#ffeb3b'],
      'water': ['#0d1b2a', '#00bcd4', '#e0f7fa'],
      'tree': ['#0d1f0d', '#4ade80', '#f0fff0'],
      'bird': ['#0a1a2e', '#415a77', '#ffffff'],
      'clock': ['#1a1a1a', '#c0a060', '#f5f5dc'],
      'book': ['#1a1a2e', '#8b6d4a', '#f5f5dc'],
      'eye': ['#0d1b2a', '#00bcd4', '#ffffff'],
      'heart': ['#1a0a1a', '#e91e63', '#fff0f5'],
      'crown': ['#1a1a0a', '#ffd700', '#fff8e1'],
    };
    return palettes[symbol.toLowerCase()] || ['#0a0a0a', '#2d2d2d', '#ffffff'];
  }

  async mapEmotionalArc(text, structure) {
    // Analyze emotional valence per beat
    const arc = [];
    
    for (const beat of structure.beats) {
      const valence = this.analyzeValence(beat.content);
      const arousal = this.analyzeArousal(beat.content);
      const dominance = this.analyzeDominance(beat.content);
      
      arc.push({
        beatIndex: beat.index,
        valence, // -1 to 1 (negative to positive)
        arousal, // 0 to 1 (calm to excited)
        dominance, // 0 to 1 (submissive to dominant)
        primaryEmotion: this.classifyEmotion(valence, arousal, dominance),
        intensity: Math.abs(valence) * arousal,
      });
    }
    
    // Smooth and find turning points
    const smoothed = this.smoothArc(arc);
    const turningPoints = this.findTurningPoints(smoothed);
    
    return {
      beats: smoothed,
      turningPoints,
      overallTone: this.computeOverallTone(smoothed),
    };
  }

  analyzeValence(text) {
    const positive = ['joy', 'happy', 'love', 'hope', 'light', 'beautiful', 'wonder', 'peace', 'triumph', 'success'];
    const negative = ['sad', 'angry', 'fear', 'hate', 'dark', 'pain', 'loss', 'death', 'failure', 'despair'];
    
    const lower = text.toLowerCase();
    const pos = positive.reduce((sum, w) => sum + (lower.split(w).length - 1), 0);
    const neg = negative.reduce((sum, w) => sum + (lower.split(w).length - 1), 0);
    const total = pos + neg;
    
    return total > 0 ? (pos - neg) / total : 0;
  }

  analyzeArousal(text) {
    const highArousal = ['urgent', 'rush', 'heart', 'pound', 'race', 'scream', 'explode', 'sudden', 'shock', 'intense'];
    const lowArousal = ['calm', 'slow', 'peace', 'quiet', 'still', 'gentle', 'soft', 'rest', 'sleep', 'dream'];
    
    const lower = text.toLowerCase();
    const high = highArousal.reduce((sum, w) => sum + (lower.split(w).length - 1), 0);
    const low = lowArousal.reduce((sum, w) => sum + (lower.split(w).length - 1), 0);
    const total = high + low;
    
    return total > 0 ? high / total : 0.5;
  }

  analyzeDominance(text) {
    const dominant = ['command', 'control', 'power', 'lead', 'decide', 'force', 'conquer', 'rule', 'master', 'authority'];
    const submissive = ['follow', 'obey', 'submit', 'yield', 'surrender', 'helpless', 'powerless', 'weak', 'small', 'serve'];
    
    const lower = text.toLowerCase();
    const dom = dominant.reduce((sum, w) => sum + (lower.split(w).length - 1), 0);
    const sub = submissive.reduce((sum, w) => sum + (lower.split(w).length - 1), 0);
    const total = dom + sub;
    
    return total > 0 ? dom / total : 0.5;
  }

  classifyEmotion(valence, arousal, dominance) {
    if (valence > 0.3 && arousal > 0.6) return 'excitement';
    if (valence > 0.3 && arousal < 0.4) return 'contentment';
    if (valence < -0.3 && arousal > 0.6) return 'anger';
    if (valence < -0.3 && arousal < 0.4) return 'sadness';
    if (valence > 0 && arousal > 0.5 && dominance > 0.6) return 'triumph';
    if (valence < 0 && arousal > 0.5 && dominance < 0.4) return 'fear';
    if (Math.abs(valence) < 0.2 && arousal < 0.3) return 'calm';
    return 'neutral';
  }

  smoothArc(arc) {
    const window = 3;
    return arc.map((point, i) => {
      const start = Math.max(0, i - window);
      const end = Math.min(arc.length, i + window + 1);
      const slice = arc.slice(start, end);
      
      return {
        ...point,
        valence: slice.reduce((s, p) => s + p.valence, 0) / slice.length,
        arousal: slice.reduce((s, p) => s + p.arousal, 0) / slice.length,
        dominance: slice.reduce((s, p) => s + p.dominance, 0) / slice.length,
      };
    });
  }

  findTurningPoints(arc) {
    const points = [];
    for (let i = 1; i < arc.length - 1; i++) {
      const prev = arc[i - 1];
      const curr = arc[i];
      const next = arc[i + 1];
      
      // Valence turning point
      if ((curr.valence - prev.valence) * (next.valence - curr.valence) < -0.1) {
        points.push({ beatIndex: curr.beatIndex, type: 'valence-turn', magnitude: Math.abs(next.valence - prev.valence) });
      }
      
      // Arousal spike
      if (curr.arousal > 0.7 && curr.arousal > prev.arousal + 0.2 && curr.arousal > next.arousal + 0.2) {
        points.push({ beatIndex: curr.beatIndex, type: 'arousal-peak', magnitude: curr.arousal });
      }
      
      // Emotion shift
      if (curr.primaryEmotion !== prev.primaryEmotion) {
        points.push({ beatIndex: curr.beatIndex, type: 'emotion-shift', from: prev.primaryEmotion, to: curr.primaryEmotion });
      }
    }
    return points;
  }

  computeOverallTone(arc) {
    const avgValence = arc.reduce((s, p) => s + p.valence, 0) / arc.length;
    const avgArousal = arc.reduce((s, p) => s + p.arousal, 0) / arc.length;
    
    let tone = 'neutral';
    if (avgValence > 0.2) tone = avgArousal > 0.5 ? 'hopeful-energetic' : 'hopeful-calm';
    else if (avgValence < -0.2) tone = avgArousal > 0.5 ? 'dark-intense' : 'melancholic';
    
    return { tone, avgValence, avgArousal };
  }

  async extractCharacters(text, structure) {
    // Simple entity extraction for character anchoring
    const properNouns = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    const freq = {};
    for (const noun of properNouns) {
      if (noun.length > 2) freq[noun] = (freq[noun] || 0) + 1;
    }
    
    const candidates = Object.entries(freq)
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, mentions: count }));
    
    // Associate with beats
    for (const char of candidates) {
      char.beats = structure.beats
        .filter(b => b.content.includes(char.name))
        .map(b => b.index);
    }
    
    return candidates;
  }

  async analyzePacing(text, structure, targetFormat) {
    const wordsPerBeat = structure.beats.map(b => b.wordCount);
    const avgWords = wordsPerBeat.reduce((a, b) => a + b, 0) / wordsPerBeat.length;
    
    // Target durations by format
    const formatDurations = {
      movie: { totalMinutes: 90, beatSeconds: 135 }, // 40 beats * 135s = 90min
      series: { totalMinutes: 300, beatSeconds: 450 }, // 10 eps * 30min
      shorts: { totalMinutes: 10, beatSeconds: 15 }, // 40 beats * 15s = 10min
    };
    
    const format = formatDurations[targetFormat] || formatDurations.movie;
    
    return {
      wordsPerBeat,
      avgWordsPerBeat: avgWords,
      targetBeatDuration: format.beatSeconds,
      totalTargetDuration: format.totalMinutes * 60,
      pacingVariance: this.computeVariance(wordsPerBeat),
      recommendedCuts: this.recommendCuts(wordsPerBeat, format.beatSeconds),
    };
  }

  computeVariance(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length;
  }

  recommendCuts(wordsPerBeat, targetSeconds) {
    const wps = 150; // words per second spoken
    return wordsPerBeat.map((words, i) => ({
      beatIndex: i,
      estimatedDuration: words / wps,
      targetDuration: targetSeconds,
      needsCompression: words / wps > targetSeconds * 1.5,
      needsExpansion: words / wps < targetSeconds * 0.5,
    }));
  }

  buildGenomeTemplate(structure, visualMotifs, emotionalArc, pacing) {
    return structure.beats.map((beat, i) => {
      const emotion = emotionalArc.beats[i] || {};
      const visual = visualMotifs[i % visualMotifs.length] || {};
      const pace = pacing.recommendedCuts[i] || {};
      
      return {
        beatIndex: i,
        // Visual genome
        geometry: visual.geometries?.[0] || 'tesseract',
        geometryOptions: visual.geometries || ['tesseract'],
        material: visual.materials?.[0] || 'lambertian',
        materialOptions: visual.materials || ['lambertian'],
        palette: visual.palette || ['#0a0a0a', '#1a1a1a', '#2d2d2d', '#4a4a4a', '#ffffff'],
        // Camera genome
        cameraPath: this.emotionToCameraPath(emotion.primaryEmotion),
        cameraSpeed: pace.needsCompression ? 'fast' : pace.needsExpansion ? 'slow' : 'medium',
        // Lighting genome
        lightingMood: this.emotionToLighting(emotion.valence, emotion.arousal),
        // Temporal genome
        duration: pace.targetDuration || 135,
        transitionType: this.emotionToTransition(emotion.primaryEmotion),
        // Semantic genome
        symbols: visual.sourceSymbol ? [visual.sourceSymbol] : [],
        motifs: visual.sourceTheme ? [visual.sourceTheme] : [],
        // Evolution constraints
        mutationRate: 0.15,
        continuityWeight: i > 0 ? 0.7 : 0,
        fitnessWeights: {
          visualFidelity: 0.3,
          narrativeAlignment: 0.4,
          emotionalResonance: 0.2,
          technicalQuality: 0.1,
        },
      };
    });
  }

  emotionToCameraPath(emotion) {
    const paths = {
      excitement: 'dynamic-orbit',
      contentment: 'slow-drift',
      anger: 'aggressive-push',
      sadness: 'slow-pull-back',
      triumph: 'rising-crane',
      fear: 'shaky-handheld',
      calm: 'gentle-orbit',
      neutral: 'standard-orbit',
    };
    return paths[emotion] || 'standard-orbit';
  }

  emotionToLighting(valence, arousal) {
    if (valence > 0.2 && arousal > 0.5) return 'bright-dramatic';
    if (valence > 0.2 && arousal < 0.4) return 'soft-warm';
    if (valence < -0.2 && arousal > 0.5) return 'harsh-contrast';
    if (valence < -0.2 && arousal < 0.4) return 'dim-cold';
    return 'neutral-balanced';
  }

  emotionToTransition(emotion) {
    const transitions = {
      excitement: 'cut',
      contentment: 'dissolve',
      anger: 'smash-cut',
      sadness: 'slow-fade',
      triumph: 'iris-in',
      fear: 'glitch-cut',
      calm: 'cross-dissolve',
      neutral: 'cut',
    };
    return transitions[emotion] || 'cut';
  }
}

export default NarrativeDNAExtractor;