/**
 * StoryForge ↔ Mandala Production Contract
 * Version: 1.0
 * 
 * Defines the versioned hand-off between narrative authoring (StoryForge)
 * and the Mandala rendering pipeline. Every artifact carries cryptographic
 * lineage so the final film can be traced back to narrative intent.
 * 
 * ESM module: import { ..., canonicalHash, ... } from ".../contracts.js"
 */

import { createHash } from "crypto"

// === Production Identity ===

/** Unique production identifier (UUIDv4 format) */
export const PRODUCTION_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Narrative identifier linking shots into a single story */
/** Narrative identifier linking shots into a single story */
export const NARRATIVE_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// === MandalaProductionRequest ===

/** Validate production request shape (called by isValidProductionRequest) */
function validateProductionRequestShape(obj) {
  return (
    obj &&
    typeof obj.productionId === "string" && PRODUCTION_ID_REGEX.test(obj.productionId) &&
    typeof obj.narrativeId === "string" && NARRATIVE_ID_REGEX.test(obj.narrativeId) &&
    Array.isArray(obj.actors) &&
    Array.isArray(obj.shotTimeline) &&
    typeof obj.renderContract === "object" &&
    typeof obj.continuityConstraints === "object" &&
    Array.isArray(obj.evidenceRequirements)
  )
}

/** isValidProductionRequest — client-facing validation */
export function isValidProductionRequest(obj) {
  return validateProductionRequestShape(obj)
}

/** validateProductionRequest — returns { valid, errors } */
export function validateProductionRequest(req) {
  const errors = []

  if (!validateProductionRequestShape(req)) {
    if (req.productionId && !PRODUCTION_ID_REGEX.test(req.productionId))
      errors.push("productionId must be a valid UUIDv4")
    if (req.narrativeId && !NARRATIVE_ID_REGEX.test(req.narrativeId))
      errors.push("narrativeId must be a valid UUIDv4")
    if (!req.world || typeof req.world !== "object") errors.push("world must be a defined object")
    if (!Array.isArray(req.actors) || req.actors.length === 0)
      errors.push("actors must be a non-empty array")
    else {
      for (const actor of req.actors) {
        if (!actor.characterId) errors.push(`actor missing characterId`)
        if (!actor.species) errors.push(`actor missing species`)
      }
    }
    if (!Array.isArray(req.shotTimeline) || req.shotTimeline.length === 0)
      errors.push("shotTimeline must be a non-empty array")
    else {
      for (const shot of req.shotTimeline) {
        if (!shot.shotId || !shot.startFrame || !shot.endFrame)
          errors.push(`shot missing shotId/startFrame/endFrame`)
        if (shot.rotationPlanes && !Array.isArray(shot.rotationPlanes))
          errors.push(`shot rotationPlanes must be an array`)
      }
    }
    if (req.renderContract && typeof req.renderContract !== "object")
      errors.push("renderContract must be an object")
    if (!Array.isArray(req.evidenceRequirements)) errors.push("evidenceRequirements must be an array")
  }

  return { valid: errors.length === 0, errors }
}

// === MandalaShotArtifact ===

/** isValidShotArtifact — client-facing validation */
export function isValidShotArtifact(obj) {
  return (
    obj &&
    typeof obj.productionId === "string" && PRODUCTION_ID_REGEX.test(obj.productionId) &&
    typeof obj.narrativeId === "string" && NARRATIVE_ID_REGEX.test(obj.narrativeId) &&
    typeof obj.shotId === "string" &&
    typeof obj.characterStateHash === "string" && obj.characterStateHash.length === 64 &&
    typeof obj.worldStateHash === "string" && obj.worldStateHash.length === 64 &&
    typeof obj.meshHash === "string" && obj.meshHash.length === 64 &&
    typeof obj.rigHash === "string" && obj.rigHash.length === 64 &&
    typeof obj.renderHash === "string" && obj.renderHash.length === 64 &&
    typeof obj.projectionHash === "string" && obj.projectionHash.length === 64 &&
    Array.isArray(obj.frames) &&
    typeof obj.evidence === "object" && obj.evidence !== null
  )
}

// === Canonical SHA-256 Helpers ===

function canonicalJsonStringify(obj) {
  // Sort keys recursively for deterministic output
  const sorted = {}
  for (const key of Object.keys(obj).sort()) {
    const val = obj[key]
    if (val && typeof val === "object" && !Array.isArray(val)) {
      sorted[key] = canonicalJsonStringify(val)
    } else {
      sorted[key] = val
    }
  }
  // Handle arrays: sort array elements that are objects
  if (Array.isArray(obj)) {
    const sortedArr = obj.map((item, i) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const sortedItem = {}
        for (const key of Object.keys(item).sort()) {
          sortedItem[key] = canonicalJsonStringify(item[key])
        }
        return sortedItem
      }
      return item
    })
    return JSON.stringify(sortedArr)
  }
  return JSON.stringify(sorted)
}

/** Stable SHA-256 of JSON (canonical, sorted keys, no undefined/null) */
export function canonicalHash(obj) {
  const cleaned = canonicalJsonStringify(obj)
  return createHash("sha256").update(cleaned).digest("hex")
}

/** Hash a character's state at a point in time */
export function characterStateHash(actor, rotationPlanes, frame) {
  const data = {
    characterId: actor.characterId,
    species: actor.species,
    rotationPlanes: rotationPlanes,
    frame,
    rigId: actor.rigId,
  }
  return canonicalHash(data)
}

/** Hash the world state (projection, distance4d, etc.) */
export function worldStateHash(world, distance4d) {
  const data = {
    world: JSON.stringify(world),
    distance4d,
  }
  return canonicalHash(data)
}

/** Hash the GLB mesh + rig combination */
export function meshRigHash(glbBytes, rigSchema) {
  const data = {
    glbSha256: createHash("sha256").update(glbBytes).digest("hex"),
    rigSchemaSha256: createHash("sha256").update(JSON.stringify(rigSchema)).digest("hex"),
  }
  return canonicalHash(data)
}

/** Hash the render projection parameters */
export function projectionHash(distance4d, spp, maxDepth, envExposure) {
  const data = {
    distance4d,
    spp,
    maxDepth,
    envExposure,
  }
  return canonicalHash(data)
}