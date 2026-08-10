// mrs/narrative/genome-schemas.js
// Genome Schemas with Zod validation for RMLC/NFC compliance

import { z } from 'zod';

// ============================================
// BASE SCHEMAS
// ============================================

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export const Vec4Schema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const PaletteSchema = z.array(ColorSchema).min(3).max(8);

// ============================================
// VISUAL GENOME
// ============================================

export const GeometryTypeSchema = z.enum([
  'tesseract', 'clifford-torus', 'hopf-fibration', 'gyroid', 
  'trefoil-4d', 'unfolding-hypercube', 'blooming-gyroid', 
  'morphing-tesseract', 'flow-gyroid', 'clashing-tetrahedra',
  'stressed-gyroid', 'recursive-cube', 'data-gyroid',
  'organic-gyroid', 'growing-torus', 'hourglass-torus', 
  'entropy-cube', 'breaking-cube', 'expanding-torus',
  'portal-torus', 'hyperbolic-door', 'linked-tori', 'chain-gyroid',
  'mirror-cube', 'reflective-torus', 'emissive-sphere', 'ray-cube',
  'absorbing-cube', 'void-torus', 'flame-gyroid', 'burning-tesseract',
  'flow-torus', 'liquid-cube', 'branching-gyroid', 'organic-torus',
  'flight-path', 'soaring-torus', 'lens-torus', 'observing-sphere',
  'pulsing-gyroid', 'heart-torus', 'spire-cube', 'corona-torus',
  'tesseract-key', 'symbolic-gyroid', 'emblem-cube'
]);

export const MaterialTypeSchema = z.enum([
  'lambertian', 'ggx', 'mirror', 'glass', 'metal', 'obsidian',
  'warm-glass', 'gold', 'subsurface', 'charcoal', 'matte-stone',
  'absorbing', 'crystalline', 'prism', 'emissive', 'liquid-metal',
  'iridescent', 'phase-shift', 'fractured', 'emissive-cracks', 'lava',
  'holographic', 'wireframe', 'neon-emissive', 'subsurface-skin',
  'chlorophyll', 'bark', 'sand', 'rust', 'decaying',
  'shattering-glass', 'light-rays', 'open-space', 'symbolic', 'emissive',
  'lambertian-dust', 'ggx-polished'
]);

export const CameraPathSchema = z.enum([
  'standard-orbit', 'dynamic-orbit', 'slow-drift', 'aggressive-push',
  'slow-pull-back', 'rising-crane', 'shaky-handheld', 'gentle-orbit',
  'slow-push', 'handheld-shake', 'dolly-zoom', 'crane-up'
]);

export const LightingMoodSchema = z.enum([
  'bright-dramatic', 'soft-warm', 'harsh-contrast', 'dim-cold',
  'neutral-balanced', 'golden-hour', 'blue-hour', 'rim-light',
  'volumetric', 'subsurface-glow'
]);

export const TransitionTypeSchema = z.enum([
  'cut', 'dissolve', 'smash-cut', 'slow-fade', 'iris-in', 
  'glitch-cut', 'cross-dissolve', 'iris-out', 'wipe', 'match-cut'
]);

export const VisualGenomeSchema = z.object({
  beatIndex: z.number().int().nonnegative(),
  
  // Geometry
  geometry: GeometryTypeSchema,
  geometryOptions: z.array(GeometryTypeSchema).min(1).max(5),
  
  // Material
  material: MaterialTypeSchema,
  materialOptions: z.array(MaterialTypeSchema).min(1).max(5),
  
  // Color
  palette: PaletteSchema,
  
  // Camera
  cameraPath: CameraPathSchema,
  cameraSpeed: z.enum(['slow', 'medium', 'fast']),
  cameraParams: z.record(z.number()).optional(),
  
  // Lighting
  lightingMood: LightingMoodSchema,
  lightingParams: z.record(z.number()).optional(),
  
  // Evolution constraints
  mutationRate: z.number().min(0).max(1).default(0.15),
  continuityWeight: z.number().min(0).max(1).default(0.7),
  
  // Fitness weights (must sum to 1)
  fitnessWeights: z.object({
    visualFidelity: z.number().min(0).max(1),
    narrativeAlignment: z.number().min(0).max(1),
    emotionalResonance: z.number().min(0).max(1),
    technicalQuality: z.number().min(0).max(1),
  }).refine(w => Math.abs(w.visualFidelity + w.narrativeAlignment + w.emotionalResonance + w.technicalQuality - 1) < 0.01, {
    message: 'Fitness weights must sum to 1'
  }),
});

// ============================================
// TEMPORAL GENOME
// ============================================

export const TemporalGenomeSchema = z.object({
  beatIndex: z.number().int().nonnegative(),
  
  duration: z.number().positive().default(135), // seconds
  transitionType: TransitionTypeSchema,
  transitionDuration: z.number().min(0).max(30).default(2),
  
  // Pacing
  pacingCurve: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'custom']),
  customPacing: z.array(z.number()).optional(),
  
  // Frame-level
  fps: z.number().int().positive().default(30),
  frameCount: z.number().int().positive().optional(),
  
  // Timing offsets
  startOffset: z.number().default(0),
  endOffset: z.number().default(0),
  
  // Motion
  motionBlur: z.boolean().default(false),
  shutterAngle: z.number().min(0).max(360).default(180),
});

// ============================================
// SEMANTIC GENOME
// ============================================

export const SemanticGenomeSchema = z.object({
  beatIndex: z.number().int().nonnegative(),
  
  symbols: z.array(z.string()).max(10),
  motifs: z.array(z.string()).max(10),
  themes: z.array(z.string()).max(5),
  
  // Narrative anchors
  characters: z.array(z.string()).max(5),
  locations: z.array(z.string()).max(5),
  keyPhrases: z.array(z.string()).max(5),
  
  // Semantic constraints
  requiredElements: z.array(z.string()).optional(),
  forbiddenElements: z.array(z.string()).optional(),
  
  // Narrative fidelity
  narrativeFidelityThreshold: z.number().min(0).max(1).default(0.7),
});

// ============================================
// EMOTIONAL GENOME
// ============================================

export const EmotionalGenomeSchema = z.object({
  beatIndex: z.number().int().nonnegative(),
  
  // VAD model (Valence, Arousal, Dominance)
  valence: z.number().min(-1).max(1),        // -1 negative to +1 positive
  arousal: z.number().min(0).max(1),         // 0 calm to 1 excited
  dominance: z.number().min(0).max(1),       // 0 submissive to 1 dominant
  
  primaryEmotion: z.enum([
    'excitement', 'contentment', 'anger', 'sadness',
    'triumph', 'fear', 'calm', 'neutral', 'wonder',
    'dread', 'awe', 'nostalgia', 'tension', 'relief'
  ]),
  
  intensity: z.number().min(0).max(1),
  
  // Emotional trajectory
  valenceTarget: z.number().min(-1).max(1).optional(),
  arousalTarget: z.number().min(0).max(1).optional(),
  
  // Emotional constraints
  emotionalContinuity: z.number().min(0).max(1).default(0.7),
  allowEmotionShift: z.boolean().default(true),
});

// ============================================
// COMPOSITE PIPELINE GENOTYPE
// ============================================

export const PipelineGenotypeSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive().default(1),
  parentId: z.string().uuid().optional(),
  
  blueprintId: z.string().uuid(),
  blueprintPattern: z.string(), // hash of blueprint features
  
  // Component genomes
  visual: VisualGenomeSchema,
  temporal: TemporalGenomeSchema,
  semantic: SemanticGenomeSchema,
  emotional: EmotionalGenomeSchema,
  
  // SME topology
  smeTopology: z.object({
    modules: z.array(z.enum([
      'sme.txt', 'sme.vis', 'sme.aud', 'sme.vid', 
      'sme.gen', 'sme.log', 'sme.core'
    ])).min(1),
    connections: z.array(z.object({
      from: z.string(),
      to: z.string(),
      type: z.enum(['sequential', 'parallel', 'conditional', 'feedback']),
    })).optional(),
  }),
  
  // Arena selection (Sovereign X)
  arenaSelection: z.object({
    primary: z.enum(['cpu', 'gpu', 'vm', 'llvm', 'twin', 'router', 'phone']),
    fallback: z.array(z.enum(['cpu', 'gpu', 'vm', 'llvm', 'twin', 'router', 'phone'])).optional(),
    selectionReason: z.string(),
  }),
  
  // Quality parameters
  quality: z.object({
    resolution: z.object({
      width: z.number().int().min(128).max(8192),
      height: z.number().int().min(128).max(8192),
    }),
    samplesPerPixel: z.number().int().min(1).max(1024).default(16),
    maxDepth: z.number().int().min(1).max(16).default(4),
    denoise: z.boolean().default(false),
  }),
  
  // Metadata
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  fitness: z.number().min(0).max(1).optional(),
  fitnessBreakdown: z.object({
    visualFidelity: z.number().min(0).max(1),
    narrativeAlignment: z.number().min(0).max(1),
    emotionalResonance: z.number().min(0).max(1),
    technicalQuality: z.number().min(0).max(1),
  }).optional(),
  
  // Governance
  governance: z.object({
    approved: z.boolean().default(false),
    approvalChain: z.array(z.string()).optional(),
    conformanceReport: z.string().optional(), // ref to conformance receipt
  }),
});

// ============================================
// BLUEPRINT PATTERN (for meta-learning)
// ============================================

export const BlueprintPatternSchema = z.object({
  id: z.string().uuid(),
  sourceType: z.enum(['prompt', 'scene', 'chapter', 'book']),
  sourceHash: z.string(), // hash of source text
  
  // Extracted features
  features: z.object({
    technical: z.object({
      complexityScore: z.number().min(0).max(1),
      geometryTypes: z.array(GeometryTypeSchema),
      materialTypes: z.array(MaterialTypeSchema),
      estimatedDuration: z.number().positive(),
    }),
    narrative: z.object({
      beatCount: z.number().int().positive(),
      themeVector: z.array(z.number()), // embedding
      emotionalArcHash: z.string(),
      characterCount: z.number().int().nonnegative(),
    }),
    semantic: z.object({
      symbolCount: z.number().int().nonnegative(),
      motifCount: z.number().int().nonnegative(),
      keyPhraseCount: z.number().int().nonnegative(),
    }),
  }),
  
  // Best performing genotypes
  bestGenotypes: z.array(z.object({
    genotypeId: z.string().uuid(),
    fitness: z.number().min(0).max(1),
    fitnessBreakdown: z.object({
      visualFidelity: z.number().min(0).max(1),
      narrativeAlignment: z.number().min(0).max(1),
      emotionalResonance: z.number().min(0).max(1),
      technicalQuality: z.number().min(0).max(1),
    }),
    evidenceRef: z.string(), // Merkle root or evidence ID
  })).max(10),
  
  // Mutation history
  mutationHistory: z.array(z.object({
    fromGenotype: z.string().uuid(),
    toGenotype: z.string().uuid(),
    mutationType: z.enum(['topology', 'parameters', 'arena', 'topology+params']),
    fitnessDelta: z.number(),
    approved: z.boolean(),
  })),
  
  updatedAt: z.string().datetime(),
});

// ============================================
// FITNESS RECORD (RMLC)
// ============================================

export const FitnessRecordSchema = z.object({
  id: z.string().uuid(),
  blueprintPatternId: z.string().uuid(),
  genotypeId: z.string().uuid(),
  
  fitness: z.number().min(0).max(1),
  fitnessBreakdown: z.object({
    visualFidelity: z.number().min(0).max(1),
    narrativeAlignment: z.number().min(0).max(1),
    emotionalResonance: z.number().min(0).max(1),
    technicalQuality: z.number().min(0).max(1),
  }),
  
  // Evidence (NFC invariant)
  evidenceRef: z.string(), // Merkle root of provenance bundle
  conformanceReportRef: z.string(), // CIEMS conformance receipt
  
  // Narrative scores (NFC)
  narrativeScores: z.object({
    semanticResonance: z.number().min(0).max(1),
    emotionalAlignment: z.number().min(0).max(1),
    motifFidelity: z.number().min(0).max(1),
    pacingCoherence: z.number().min(0).max(1),
  }).optional(),
  
  // Governance
  signedBy: z.string(), // CIEMS authority
  signature: z.string(),
  timestamp: z.string().datetime(),
});

// ============================================
// VALIDATION HELPERS
// ============================================

export const validatePipelineGenotype = (data) => PipelineGenotypeSchema.safeParse(data);
export const validateVisualGenome = (data) => VisualGenomeSchema.safeParse(data);
export const validateTemporalGenome = (data) => TemporalGenomeSchema.safeParse(data);
export const validateSemanticGenome = (data) => SemanticGenomeSchema.safeParse(data);
export const validateEmotionalGenome = (data) => EmotionalGenomeSchema.safeParse(data);
export const validateBlueprintPattern = (data) => BlueprintPatternSchema.safeParse(data);
export const validateFitnessRecord = (data) => FitnessRecordSchema.safeParse(data);

// ============================================
// TYPE EXPORTS (for TypeScript consumers)
// ============================================

/**
 * @typedef {z.infer<typeof PipelineGenotypeSchema>} PipelineGenotype
 * @typedef {z.infer<typeof VisualGenomeSchema>} VisualGenome
 * @typedef {z.infer<typeof TemporalGenomeSchema>} TemporalGenome
 * @typedef {z.infer<typeof SemanticGenomeSchema>} SemanticGenome
 * @typedef {z.infer<typeof EmotionalGenomeSchema>} EmotionalGenome
 * @typedef {z.infer<typeof BlueprintPatternSchema>} BlueprintPattern
 * @typedef {z.infer<typeof FitnessRecordSchema>} FitnessRecord
 */

export const GenomeSchemas = {
  PipelineGenotype: PipelineGenotypeSchema,
  VisualGenome: VisualGenomeSchema,
  TemporalGenome: TemporalGenomeSchema,
  SemanticGenome: SemanticGenomeSchema,
  EmotionalGenome: EmotionalGenomeSchema,
  BlueprintPattern: BlueprintPatternSchema,
  FitnessRecord: FitnessRecordSchema,
};