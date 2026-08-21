/**
 * Mandala Shot Pipeline — connects StoryForge production requests
 * to rendered shot artifacts with full cryptographic lineage.
 *
 * Pipeline: Production Request → Per-Shot Processing → GLB Export → Render → Artifact
 *
 * Key invariant: Every shot artifact carries characterStateHash, worldStateHash,
 * meshHash, rigHash, and renderHash so the final film can be traced back
 * to narrative intent.
 */

const { isValidProductionRequest, validateProductionRequest } = require("./contracts")
const { canonicalHash, worldStateHash, characterStateHash, isValidShotArtifact } = require("./contracts")
const { WireMesh4D } = require("../../../apps/rt4d-chatgpt-plugin/server/src/wire-mesh-4d.js")
const { wireMesh4DToGLB } = require("../../../packages/sovereign-sculptor/src/rt4d-to-rig-bridge.js")
const { exportSculptDocumentToGlb } = require("../../../packages/sovereign-sculptor/src/glb.js")

/**
 * Process a single shot through the Mandala pipeline.
 *
 * @param productionId  — UUID linking all shots in this production
 * @param narrativeId   — UUID linking all shots in this narrative
 * @param shot          — Shot definition from shotTimeline
 * @param actors        — Array of actor definitions for this shot
 * @param renderContract — Render parameters (spp, maxDepth, etc.)
 * @param world         — World document reference
 * @returns {Promise<MandalaShotArtifact>} The rendered shot artifact with identity tracing
 */
async function processShot({
  productionId,
  narrativeId,
  shot,
  actors,
  renderContract,
  world,
}) {
  // 1. Validate inputs
  const prodValid = isValidProductionRequest({
    productionId,
    narrativeId,
    world,
    actors,
    shotTimeline: [shot],
    renderContract,
    continuityConstraints: {},
    evidenceRequirements: [],
  })
  if (!prodValid.valid) {
    throw new Error(`Invalid production request: ${prodValid.errors.join(", ")}`)
  }

  const shotId = shot.shotId
  const startFrame = shot.startFrame
  const endFrame = shot.endFrame
  const rotationPlanes = shot.rotationPlanes || []

  // 2. Build WireMesh4D per actor (using scene seed from production)
  const sceneSeed = productionId + narrativeId + shotId
  const wireMeshes = []

  for (const actor of actors) {
    const wireMesh = WireMesh4D.buildEnergyWireMesh4d({
      sceneSeedHex: sceneSeed,
      rigBinding: actor.rigBinding,
    })
    wireMeshes.push({ actor, wireMesh })
  }

  // 3. Per-actor: project 4D → 3D, build SculptDocument, export GLB
  const actorArtifacts = []

  for (const { actor, wireMesh } of wireMeshes) {
    // Project 4D → 3D (same distance4d from renderContract)
    const distance4d = renderContract.distance4d ?? 4

    // Build GLB via the RT4D→Rig bridge
    const glbResult = wireMesh4DToGLB(
      wireMesh,
      distance4d,
      actor.characterId,
      actor.species,
      actor.rigSchema
    )

    // Compute hashes
    const meshHash = canonicalHash({
      vertexCount: glbResult.document.vertices.length,
      triangleCount: glbResult.document.triangles.length,
      species: glbResult.document.species,
    })

    const rigHash = canonicalHash({
      rigId: glbResult.rig.id,
      boneCount: glbResult.rig.bones.length,
    })

    // 3. Render frame-range (simplified: we compute the hash of the render params;
    // in a full pipeline this would dispatch the RT4D renderer)
    const renderHash = canonicalHash({
      productionId,
      narrativeId,
      shotId,
      distance4d,
      spp: renderContract.spp ?? 256,
      maxDepth: renderContract.maxDepth ?? 8,
      rotationPlanes,
    })

    // 4. Compute world state hash (projection params)
    const worldState = world || { distance4d, projection: "perspective" }
    const worldStateH = worldStateHash(worldState, distance4d)

    // 5. Compute character state hash (actor + rotation planes + frame range)
    // Use start frame as representative
    const characterStateH = characterStateHash(actor, rotationPlanes, startFrame)

    // 5. Build the MandalaShotArtifact
    const artifact = {
      productionId,
      narrativeId,
      shotId,
      characterStateHash: characterStateH,
      worldStateHash: worldStateH,
      meshHash,
      rigHash,
      renderHash,
      projectionHash: renderHash, // same as renderHash in this simplified pipeline
      frames: {
        start: startFrame,
        end: endFrame,
        rotationPlanes,
      },
      evidence: {
        productionId,
        narrativeId,
        shotId,
        meshSha256: glbResult.glbSha256,
        rigSha256: rigHash,
        renderParamsHash: renderHash,
      },
    }

    actorArtifacts.push({ actor, glb: glbResult.glb, artifact })
  }

  return actorArtifacts
}

/**
 * Process an entire production: one narrative, multiple shots.
 *
 * @param productionId    — UUID linking all shots
 * @param narrativeId     — UUID linking all shots in this narrative
 * @param world           — World document reference
 * @param actors          — Array of actor definitions (shared across shots or per-shot)
 * @param shotTimeline    — Array of shot definitions
 * @param renderContract  — Render parameters
 * @returns {Promise<Array<MandalaShotArtifact>>} Array of shot artifacts
 */
async function processProduction({
  productionId,
  narrativeId,
  world,
  actors,
  shotTimeline,
  renderContract,
}) {
  // Validate production request
  const valid = validateProductionRequest({
    productionId,
    narrativeId,
    world,
    actors,
    shotTimeline,
    renderContract,
    continuityConstraints: {},
    evidenceRequirements: [],
  })
  if (!valid.valid) {
    throw new Error(`Invalid production request: ${valid.errors.join(", ")}`)
  }

  const shotArtifacts = []

  // Process each shot in sequence (maintaining deterministic order)
  for (const shot of shotTimeline) {
    try {
      const results = await processShot({
        productionId,
        narrativeId,
        shot,
        actors,
        renderContract,
        world,
      })
      shotArtifacts.push(...results)
    } catch (err) {
      console.error(`Error processing shot ${shot.shotId}:`, err)
      // Continue with remaining shots; artifact will have error state
      shotArtifacts.push({
        productionId,
        narrativeId,
        shotId: shot.shotId,
        error: err.message,
        frames: { start: shot.startFrame, end: shot.endFrame },
      })
    }
  }

  return shotArtifacts
}

// === Export ===
module.exports = {
  processShot,
  processProduction,
  isValidProductionRequest,
  validateProductionRequest,
  isValidShotArtifact,
}

/* Demo: Simple one-warrior, three-shot test */
if (require.main === module) {
  ;(async () => {
    const result = await processProduction({
      productionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      narrativeId: "b2c3d4e5-f6g7-8901-bcde-fgh345678901",
      world: { distance4d: 4, projection: "perspective" },
      actors: [
        {
          characterId: "warrior-fox-01",
          species: "fox",
          rigId: "fox-rig-core",
          rigSchema: {
            schemaVersion: "character-rig/1.0",
            status: "core-enforced-fixture-not-production-rig",
            id: "fox-rig-core",
            species: "fox",
            bones: [
              { id: "root", parentId: null },
              { id: "spine", parentId: "root" },
              { id: "head", parentId: "spine" },
            ],
            blendshapes: [],
            capabilities: { face: true, body: true, tail: false },
          },
        },
      ],
      shotTimeline: [
        { shotId: "shot-01", startFrame: 1, endFrame: 24, rotationPlanes: [{ plane: "XW", speed: 0.3 }, { plane: "YW", speed: 0.2 }] },
        { shotId: "shot-02", startFrame: 25, endFrame: 48, rotationPlanes: [{ plane: "XW", speed: 0.35 }, { plane: "ZW", speed: 0.15 }] },
        { shotId: "shot-03", startFrame: 49, endFrame: 72, rotationPlanes: [{ plane: "YW", speed: 0.4 }, { plane: "ZW", speed: 0.25 }] },
      ],
      renderContract: { spp: 128, maxDepth: 6, distance4d: 4 },
    })

    console.log(`Processed ${result.length} actor-shot results`)
    result.forEach((r, i) => {
      if (r.error) {
        console.log(`  Shot ${i + 1} ERROR: ${r.error}`)
      } else {
        const a = r.actor
        console.log(
          `  Shot ${r.shotId}: characterStateHash=${r.characterStateHash.slice(
            0,
            16
          )}... meshHash=${r.meshHash.slice(0, 16)}... rigHash=${r.rigHash.slice(
            0,
            16
          )}...`
        )
      }
    })
  })()
}