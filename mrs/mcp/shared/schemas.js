// mrs/mcp/shared/schemas.js

import { z } from 'zod';

// Scene schemas
export const SceneSpecSchema = z.object({
  metric: z.object({ type: z.enum(['euclidean', 'minkowski']) }).optional(),
  camera: z.object({
    position4D: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    target4D: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    up4D: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    fov: z.number().optional(),
  }).optional(),
  meshes: z.array(z.object({
    id: z.string(),
    vertices4D: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])),
    indices: z.array(z.number()),
    materialId: z.string(),
  })).optional(),
  surfaces: z.array(z.object({
    id: z.string(),
    type: z.enum(['lambertian', 'ggx', 'mirror', 'glass']),
    albedo: z.tuple([z.number(), z.number(), z.number()]).optional(),
    roughness: z.number().optional(),
    metallic: z.number().optional(),
    ior: z.number().optional(),
  })).optional(),
});

export const CreateSceneSchema = z.object({
  spec: SceneSpecSchema,
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateSceneSchema = z.object({
  spec: SceneSpecSchema.partial().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Render schemas
export const RenderParamsSchema = z.object({
  resolution: z.object({
    width: z.number().int().positive().max(8192),
    height: z.number().int().positive().max(8192),
  }).optional(),
  samplesPerPixel: z.number().int().positive().max(1024).optional(),
  maxDepth: z.number().int().positive().max(16).optional(),
  seed: z.number().optional(),
});

export const RenderIdentitySchema = z.object({
  requestId: z.string().optional(),
  actorId: z.string().optional(),
  latticeNodeId: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

export const SubmitRenderSchema = z.object({
  sceneId: z.string().optional(),
  scene: SceneSpecSchema.optional(),
  renderParams: RenderParamsSchema.optional(),
  identity: RenderIdentitySchema.optional(),
  context: z.record(z.any()).optional(),
}).refine(data => data.sceneId || data.scene, {
  message: 'Either sceneId or scene must be provided',
});

// DEP schemas
export const DEPExecuteSchema = z.object({
  intentId: z.string(),
  intent: z.object({
    id: z.string().optional(),
    type: z.enum(['render', 'pipeline', 'optimize', 'evidence']),
    prompt: z.string().optional(),
  }),
  timelineId: z.string().optional(),
  worldId: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  context: z.record(z.any()).optional(),
});

// SME schemas
export const SMEDispatchSchema = z.object({
  tasks: z.array(z.object({
    sme: z.enum(['sme.txt', 'sme.vis', 'sme.aud', 'sme.vid', 'sme.gen', 'sme.log', 'sme.core']),
    action: z.string(),
    params: z.record(z.unknown()).optional(),
    taskId: z.string().optional(),
  })).min(1),
  intentId: z.string().optional(),
  correlationId: z.string().optional(),
});

// Evidence schemas
export const EvidenceItemSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  hash: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

export const EvidenceBundleSchema = z.object({
  id: z.string(),
  worldId: z.string().optional(),
  timelineId: z.string().optional(),
  items: z.array(EvidenceItemSchema).optional(),
  merkleRoot: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

// Billing schemas
export const BillingCheckoutSchema = z.object({
  planId: z.string(),
  paymentMethodId: z.string().optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

// Sovereign X schemas
export const SovereignXRouteSchema = z.object({
  scene: z.object({
    meshes: z.array(z.object({
      id: z.string(),
      vertices4D: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])),
      indices: z.array(z.number()),
      materialId: z.string(),
    })).min(1),
    surfaces: z.array(z.object({
      id: z.string(),
      type: z.enum(['lambertian', 'ggx', 'mirror', 'glass']),
      albedo: z.tuple([z.number(), z.number(), z.number()]).optional(),
      roughness: z.number().optional(),
      metallic: z.number().optional(),
      ior: z.number().optional(),
    })).optional(),
  }),
  renderParams: z.object({
    resolution: z.object({
      width: z.number().int().positive().max(8192),
      height: z.number().int().positive().max(8192),
    }).optional(),
    samplesPerPixel: z.number().int().positive().max(1024).optional(),
    maxDepth: z.number().int().positive().max(16).optional(),
    seed: z.number().optional(),
  }).optional(),
  identity: z.object({
    requestId: z.string().optional(),
    actorId: z.string().optional(),
    latticeNodeId: z.string().optional(),
    timestamp: z.string().datetime().optional(),
  }).optional(),
  evidenceIds: z.array(z.string()).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
});

export const SovereignXHipDetectSchema = z.object({
  invokeTools: z.boolean().optional(),
});

// Common schemas
export const PaginationSchema = z.object({
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});

export const IdempotencyKeySchema = z.string().min(1).max(64);

export const CorrelationIdSchema = z.string().uuid();

// Validation helper
export const validateSchema = (schema) => (data) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { ok: false, errors: result.error.flatten().fieldErrors };
  }
  return { ok: true, data: result.data };
};