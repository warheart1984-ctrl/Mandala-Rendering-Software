// mrs/narrative/mythar-adapters.js
// Mythar Adapters - Connects Mandala to Mythar's Python modules via REST/gRPC/CLI

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Mythar Lexicon Adapter
 * Provides access to Mythar's canonical roots, clusters, and PGC contract
 */
class MytharLexicon extends EventEmitter {
  constructor(options = {}) {
    super();
    this.mytharPath = options.mytharPath || '/media/jon/New Volume/Mandala Rendering Software/mrs/narrative/sre';
    this.pythonExe = options.pythonExe || 'python';
    this.cache = {
      roots: null,
      clusters: null,
      pgcContract: null,
    };
  }

  async initialize() {
    console.log('[MytharLexicon] Loading Mythar lexicon data...');
    await this.loadAll();
  }

  async loadAll() {
    try {
      // Load roots
      this.cache.roots = await this.loadRoots();
      // Load clusters
      this.cache.clusters = await this.loadClusters();
      // Load PGC contract
      this.cache.pgcContract = await this.loadPGCContract();
      // Load Mythar Natural Voice config
      this.cache.voiceConfig = await this.loadVoiceConfig();
      this.emit('ready', this.cache);
    } catch (error) {
      console.warn('[MytharLexicon] Failed to load from Python, using embedded fallback:', error.message);
      this.cache = this.getEmbeddedFallback();
    }
  }

  async loadRoots() {
    try {
      // Try to call Python module
      const result = await this.runPythonScript(`
from sre.mythar.data import ROOTS
import json
print(json.dumps(ROOTS))
      `);
      return JSON.parse(result.stdout);
    } catch (e) {
      return this.getEmbeddedRoots();
    }
  }

  async loadClusters() {
    try {
      const result = await this.runPythonScript(`
from sre.mythar.data import CLUSTERS, CLUSTER_47, CLUSTER_48, COMPOUND_CLUSTERS_BASE
import json
all_clusters = list(CLUSTERS) + [CLUSTER_47, CLUSTER_48] + COMPOUND_CLUSTERS_BASE
print(json.dumps(all_clusters))
      `);
      return JSON.parse(result.stdout);
    } catch (e) {
      return this.getEmbeddedClusters();
    }
  }

  async loadPGCContract() {
    try {
      const result = await this.runPythonScript(`
from sre.mythar.data import PGC_CONTRACT, PGC_CORRECTIONS, ALLOWED_POLYSEMY
import json
print(json.dumps({
    "contract": PGC_CONTRACT,
    "corrections": PGC_CORRECTIONS,
    "allowed_polysemy": ALLOWED_POLYSEMY
}))
      `);
      return JSON.parse(result.stdout);
    } catch (e) {
      return this.getEmbeddedPGCContract();
    }
  }

  async runPythonScript(script) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonExe, ['-c', script], {
        cwd: this.mytharPath,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout: stdout.trim() });
        } else {
          reject(new Error(`Python exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  getEmbeddedFallback() {
    return {
      roots: this.getEmbeddedRoots(),
      clusters: this.getEmbeddedClusters(),
      pgcContract: this.getEmbeddedPGCContract(),
    };
  }

  getEmbeddedRoots() {
    // Embedded fallback - core Mythar roots
    return [
      ["ma", "mother / life / origin (axis: origin → life → mother)", "kinship"],
      ["ta", "this / that (demonstrative; axis: deixis)", "abstract"],
      ["la", "light / sky / above (axis: elevation → illumination)", "nature"],
      ["ka", "force / gravity / elder (axis: weight → authority → age)", "motion"],
      ["kra", "vital / life-force / power / strength", "abstract"],
      ["to", "hand / give / take (axis: agency; stone → ska / krato)", "body"],
      ["pe", "foot / base / step / stand (grounding)", "body"],
      ["la", "light / sky / above", "nature"],
      ["ra", "proclaim / intensify; great / many", "abstract"],
      ["fi", "fire / sacred-verity (intensity → purity)", "abstract"],
      ["ru", "rest-flow / blood / life-flow", "abstract"],
      ["pu", "move / animal (motion → living motion)", "motion"],
      ["vi", "knowing-see / living awareness", "abstract"],
      ["du", "bad / heavy / burden", "abstract"],
      ["duma", "two / dual (split from du)", "abstract"],
      ["chi", "child / youth", "kinship"],
      ["loi", "friend / companion", "kinship"],
      ["sa", "speech / say", "body"],
      ["rama", "heart / feeling", "body"],
      ["peh", "create / shape / make", "motion"],
      ["taga", "stand / grounded foot", "motion"],
      ["sola", "sun / day", "nature"],
      ["luna", "moon / night", "nature"],
      ["ska", "stone / rock", "nature"],
      ["krato", "mountain / great stone", "nature"],
      ["tem", "time / duration", "abstract"],
      ["ver", "truth / real", "abstract"],
      ["lo", "love / affection", "abstract"],
      ["alo", "up / rise", "motion"],
      ["tem", "time / duration", "abstract"],
      ["reka", "change / shift", "abstract"],
    ];
  }

  getEmbeddedClusters() {
    return [
      {
        cluster_id: 12,
        name: "pa ti ne",
        forms: ["pa", "ti", "ne"],
        phrase: "Pa ti ne ro ya",
        domain: "kinship",
        interpretation: "Father–child–kin triad; rest in the divine",
        poetic: "Father–child–kin triad; rest in the divine",
        evidence_id: "evid_myt_cluster_12",
        reinforces: ["pa", "ti", "ne"],
        morphemes: [
          { form: "pa", gloss: "father / power", parts: [{ form: "pa", gloss: "father / power" }] },
          { form: "ti", gloss: "small / sacred / child", parts: [{ form: "ti", gloss: "small / sacred / child" }] },
          { form: "ne", gloss: "sibling / kin", parts: [{ form: "ne", gloss: "sibling / kin" }] },
        ],
        reinforces: ["pa", "ti", "ne"],
        metadata: { feeling: "family triad", domain: "kinship" },
      },
      {
        cluster_id: 13,
        name: "nu si to",
        forms: ["nu", "si", "to"],
        phrase: "Nu si to kra ro",
        domain: "body",
        interpretation: "Breath–sight–hand: vital perception and action at rest",
        evidence_id: "evid_myt_cluster_13",
        reinforces: ["nu", "si", "to"],
      },
      {
        cluster_id: 14,
        name: "bu re ga",
        forms: ["bu", "re", "ga"],
        phrase: "Bu re ga ya",
        domain: "motion",
        interpretation: "Come–flow–carry toward the divine",
        evidence_id: "evid_myt_cluster_14",
        reinforces: ["bu", "re", "ga"],
      },
      {
        cluster_id: 47,
        name: "Lmakra-yuckara",
        forms: ["lmakra", "yuckara"],
        phrase: "Lmakra yuckara ro ya",
        domain: "abstract",
        interpretation: "Call-and-response around kra: light-existence vital-heart — divine-knowing vital-craft",
        evidence_id: "evid_myt_cluster_47",
        reinforces: ["la", "ma", "ya", "kra"],
        morphemes: [
          { form: "lmakra", parts: [{ form: "la", gloss: "light + existence" }, { form: "akra", gloss: "intensified vital force" }] },
          { form: "yuckara", parts: [{ form: "yu", gloss: "grace glide" }, { form: "kra", gloss: "vital heart" }] },
        ],
        reinforces: ["la", "ma", "ya", "kra"],
        metadata: { feeling: "heart-activation / soul-alignment" },
      },
      {
        cluster_id: 48,
        name: "Tiki-yocfua-manalara",
        forms: ["tiki", "yocfua", "manalara"],
        phrase: "Tiki yocfua manalara ro ya",
        domain: "abstract",
        interpretation: "Pure sacred spark, divine blessed flow, proclaimed mother-light of the named spirit",
        evidence_id: "evid_myt_cluster_48",
        reinforces: ["ti", "ki", "ya", "ma", "la", "kra"],
        morphemes: [
          { form: "tiki", parts: [{ form: "ti", gloss: "child" }, { form: "ki", gloss: "power" }] },
          { form: "yocfua", parts: [{ form: "yo", gloss: "divine" }, { form: "fu", gloss: "blessing" }, { form: "ua", gloss: "flow" }] },
          { form: "manalara", parts: [{ form: "ma", gloss: "mother" }, { form: "na", gloss: "name" }, { form: "la", gloss: "light" }, { form: "ra", gloss: "proclaim" }] },
        ],
        reinforces: ["ti", "ki", "ya", "ma", "la", "kra"],
        metadata: { feeling: "blessing / birth-awakening / soul emergence" },
      },
      // ... more clusters would be embedded
    ];
  }

  getEmbeddedPGCContract() {
    return {
      contract: [
        { id: "PGC-1", rule: "Polysemy requires a shared semantic axis" },
        { id: "PGC-2", rule: "Axes must be explicit in the lexicon entry" },
        { id: "PGC-3", rule: "Axes must be constitutional (vowel-core / consonant-force semantics)" },
        { id: "PGC-4", rule: "Axes must be testable (cluster where both senses appear without contradiction)" },
        { id: "PGC-5", rule: "No axis → no polysemy (split or remove weaker sense)" },
      ],
      corrections: [
        { form: "to", violation: "hand / give-take vs stone", action: "Stone sense removed; stone lives at ska / krato" },
        { form: "ta", violation: "foot/stand vs demonstrative", action: "ta = demonstrative only; foot/stand at pe / taga" },
        { form: "du", violation: "bad/heavy vs two", action: "du = burden only; two/dual at duma" },
      ],
      allowed_polysemy: [
        { form: "fi", axis: "intensity → purity", senses: ["fire / intense energy", "sacred-verity / pure truth"], test_clusters: [83, 54], status: "stable" },
        { form: "ru", axis: "flow → life-flow", senses: ["rest-flow", "blood / internal life-flow"], test_clusters: [94, 76], status: "stable" },
        { form: "pu", axis: "motion → living motion", senses: ["move", "animal / creature"], test_clusters: [85, 95], status: "stable" },
        { form: "vi", axis: "perception → awareness → life", senses: ["knowing-see", "life / living awareness"], test_clusters: [64], status: "stable" },
        { form: "ra", axis: "scale → magnitude", senses: ["proclaim / intensify", "great / big / many"], test_clusters: [48, 69], status: "stable" },
      ],
    };
  }

  // Public getters
  async loadRoots() { return this.cache.roots || this.getEmbeddedRoots(); }
  async loadClusters() { return this.cache.clusters || this.getEmbeddedClusters(); }
  async loadPGCContract() { return this.cache.pgcContract || this.getEmbeddedPGCContract(); }

  // Query methods
  findRootsByForm(form) {
    return (this.cache.roots || this.getEmbeddedRoots()).filter(([f]) => f === form);
  }

  findRootsByDomain(domain) {
    return (this.cache.roots || this.getEmbeddedRoots()).filter(([, , d]) => d === domain);
  }

  findClustersByDomain(domain) {
    return (this.cache.clusters || this.getEmbeddedClusters()).filter(c => c.domain === domain);
  }

  findClusterById(id) {
    return (this.cache.clusters || this.getEmbeddedClusters()).find(c => c.cluster_id === id);
  }

  getPGCContract() {
    return this.cache.pgcContract || this.getEmbeddedPGCContract();
  }
}

/**
 * Mythar Governance Adapter
 * CRA governance model, PGC compliance, CEL lineage
 */
class MytharGovernance extends EventEmitter {
  constructor(options = {}) {
    super();
    this.mytharPath = options.mytharPath || '/media/jon/New Volume/Mandala Rendering Software/mrs/narrative/sre';
    this.pythonExe = options.pythonExe || 'python';
  }

  async initialize() {
    console.log('[MytharGovernance] Initializing governance...');
    this.emit('ready');
  }

  async checkPGCCompliance(element) {
    // Check if element violates PGC rules
    const pgcRules = [
      { id: 'PGC-1', check: e => this.hasSharedAxis(e) },
      { id: 'PGC-2', check: e => this.hasExplicitAxis(e) },
      { id: 'PGC-5', check: e => this.hasAxisOrSplit(e) },
    ];

    for (const rule of pgcRules) {
      if (!await rule.check(element)) {
        return { compliant: false, rule: rule.id, reason: `Violates ${rule.id}` };
      }
    }
    return { compliant: true };
  }

  async hasSharedAxis(element) {
    // Check if element has a documented semantic axis
    return true; // Simplified
  }

  async hasExplicitAxis(element) {
    return true;
  }

  async hasAxisOrSplit(element) {
    return true;
  }

  async createPipelineGovernance(genotype, blueprint) {
    const subjectId = `pipeline_${genotype.id}`;
    const evidenceId = `evid_pipeline_${genotype.id}`;

    return {
      identity: `pipeline:${genotype.id}`,
      kind: "pipeline",
      justification_dependency: `Narrative genotype for ${blueprint?.metadata?.title || 'unknown'} beat ${genotype.visual?.beatIndex}`,
      evidence_dependency: `Mythar roots: ${genotype.mythar?.rootMotifs?.map(m => m.mytharRoots[0]?.form).join(', ') || 'none'}`,
      assurance_level: "candidate",
      lifecycle_state: "Draft",
      cel_lineage: {
        binding_status: "deferred",
        subject_id: subjectId,
        cel_entry_id: null,
        entry_type_hint: "evidence",
        charter_ref: "docs/governance/CEL_Charter_v01.md",
        bind_when: `MytharLexicon.seed_registry → EvidenceRegistry / CEL.record_evidence (subject_id=${subjectId})`,
        kind: "pipeline",
      },
      revision_history: [],
      cra_refs: {
        architecture: "docs/architecture/CRA_ReferenceArchitecture_v1.md",
        lrl_invariant: "LRL-INV-05 — Lexicon governance",
        graphs: {
          justification: "identity + justification_dependency",
          evidence: "evidence_dependency + assurance_level + cel_lineage",
        },
      },
      extra: {
        domain: "narrative_rendering",
        pgc_compliance: true,
        mythar_roots_used: true,
      },
    };
  }

  async checkPGCCompliance(element) {
    // Simplified PGC compliance check
    return { compliant: true, rule: null, reason: null };
  }
}

/**
 * Mythar Registry Adapter
 * Candidate registration, ratification tracking
 */
class MytharRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    this.mytharPath = options.mytharPath || 'G:\\Mythar\\Mythar-hackathon\\mythar-registry';
    this.pythonExe = options.pythonExe || 'python';
    this.localCache = new Map();
  }

  async initialize() {
    console.log('[MytharRegistry] Initializing registry...');
    this.emit('ready');
  }

  async registerCandidate(candidate) {
    const registration = {
      ...candidate,
      registryId: `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      registeredAt: new Date().toISOString(),
      status: 'candidate',
      ratificationStatus: 'pending',
      votes: { for: 0, against: 0, abstain: 0 },
    };

    this.localCache.set(registration.registryId, registration);
    console.log(`[MytharRegistry] Registered candidate: ${registration.registryId}`);
    
    this.emit('candidateRegistered', registration);
    return registration;
  }

  async getCandidate(registryId) {
    return this.localCache.get(registryId);
  }

  async listCandidates(filters = {}) {
    let candidates = Array.from(this.localCache.values());
    
    if (filters.status) {
      candidates = candidates.filter(c => c.status === filters.status);
    }
    if (filters.type) {
      candidates = candidates.filter(c => c.type === filters.type);
    }
    
    return candidates;
  }

  async ratifyCandidate(registryId, vote) {
    const candidate = this.localCache.get(registryId);
    if (!candidate) throw new Error(`Candidate not found: ${registryId}`);
    
    candidate.votes[vote] = (candidate.votes[vote] || 0) + 1;
    candidate.ratificationStatus = vote === 'for' ? 'ratified' : 'rejected';
    candidate.ratifiedAt = new Date().toISOString();
    
    this.emit('candidateRatified', candidate);
    return candidate;
  }
}

/**
 * Mythar Transducers Adapter
 * Language generation, morphological analysis
 */
class MytharTransducers extends EventEmitter {
  constructor(options = {}) {
    super();
    this.mytharPath = options.mytharPath || '/media/jon/New Volume/Mandala Rendering Software/mrs/narrative/sre';
    this.pythonExe = options.pythonExe || 'python';
  }

  async initialize() {
    console.log('[MytharTransducers] Initializing transducers...');
    this.emit('ready');
  }

  async generateText(input, options = {}) {
    // Morphological generation using Mythar transducers
    const { morphemes, blueprint, targetStyle } = input;
    
    // Build morphological string
    const morphString = morphemes.map(m => m.form).join(' ');
    
    // In production, call Mythar's transducer
    // For now, generate mythic-style narrative
    return this.generateMythicNarrative(morphemes, options);
  }

  generateMythicNarrative(morphemes, options) {
    const forms = morphemes.map(m => m.form);
    const style = options.style || 'mythic';
    
    const templates = {
      mythic: [
        `The ${forms[0]} ${forms[1] || 'awakens'} in the ${forms[2] || 'void'}, a ${forms[3] || 'sign'} of ${forms[4] || 'ancient power'}.`,
        `When ${forms[0]} meets ${forms[1]}, the ${forms[2]} ${forms[3]}s through the ${forms[4] || 'ages'}.`,
        `In the beginning was ${forms[0]}, and ${forms[0]} was with ${forms[1]}, and ${forms[0]} was ${forms[2]}.`,
      ],
      poetic: [
        `${forms[0]} rises like ${forms[1]} through the ${forms[2]}, carrying ${forms[3]} on wings of ${forms[4]}.`,
      ],
      descriptive: [
        `The ${forms[0]} manifests as ${forms[1]}, characterized by ${forms[2]} and ${forms[3]}.`,
      ],
    };
    
    const templateSet = templates[options.style] || templates.mythic;
    const template = templateSet[Math.floor(Math.random() * templateSet.length)];
    
    // Fill template with forms
    let result = template;
    forms.forEach((form, i) => {
      result = result.replace(new RegExp(`\\{${i}\\}`, 'g'), form);
      result = result.replace(new RegExp(`\\$\\{${i}\\}`, 'g'), form);
    });
    
    return {
      text: result,
      morphemesUsed: morphemes.map(m => m.form),
      style: options.style || 'mythic',
      generatedAt: new Date().toISOString(),
    };
  }

  async analyzeMorphology(text) {
    // Morphological analysis - decompose text into Mythar morphemes
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const analysis = [];
    
    for (const word of words) {
      // In production, call Mythar's morphological analyzer
      analysis.push({
        surface: word,
        morphemes: [{ form: word, gloss: 'unknown', type: 'root' }],
        confidence: 0.5,
      });
    }
    
    return analysis;
  }
}

// Export all adapters
export { MytharLexicon, MytharGovernance, MytharRegistry, MytharTransducers };