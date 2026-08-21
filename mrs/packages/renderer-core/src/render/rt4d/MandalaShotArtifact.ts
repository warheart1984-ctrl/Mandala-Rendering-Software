/**
 * MandalaShotArtifact/1.0
 * 
 * Canonical artifact emitted by the RT4D bridge, carrying cryptographic
 * provenance from narrative intent through representation conversion to
 * rendered pixels. Every field is hashable; the full JSON + GLB pair
 * can be verified independently.
 * 
 * Status: declared — interface contract, not yet wired into all pipelines.
 * Status tag values: "partial" (field present but not validated), 
 *                   "verified" (all hashes check out against source).
 */

export interface MandalaShotArtifact {
  /** Version string for this artifact format */
  version: "mandala-shot-artifact/1.0";

  /** Unique production identifier (UUIDv4) — links all shots in a production */
  productionId: string;

  /** Unique narrative identifier linking all shots in a single story */
  narrativeId: string;

  /** Unique world identifier (the world document hash/projection params) */
  worldId: string;

  /** Unique scene identifier within the world */
  sceneId: string;

  /** Unique shot identifier within the scene */
  shotId: string;

  /** Optional character identifier (e.g. warrior-fox-01) */
  characterId?: string;

  /** Source metadata — what produced this artifact */
  source: {
    /** Route string identifying the conversion pipeline */
    route: "rt4d-bridge";

    /** Hash of the original RenderRequest (authoritative intake) */
    renderRequestHash: string;

    /** Optional hash of the world document that provided projection params */
    worldDocumentHash?: string;
  };

  /** Geometry metadata — representation is intentionally abstract */
  geometry: {
    /** Abstract representation type — prevents semantic drift from
     * species-specific labels like "sculpted-fox". */
    representation: "rt4d-convex-energy-hull";

    /** Hash of the mesh+rig geometry (canonical JSON of vertices+indices+rig) */
    meshHash: string;

    /** Hash of the rig schema (bone list + bind transforms + constraints) */
    rigHash?: string;

    /** Hash of the complete GLB bytes (canonical SHA-256 of the binary) */
    glbHash: string;
  };

  /** Animation metadata (optional — may be empty if no animation) */
  animation?: {
    /** Hash of the pose clip (quaternion keyframe track data) */
    poseClipHash: string;

    /** Hash of the rotation plane definitions (XW/YW/ZW + speeds) */
    rotationPlanesHash: string;
  };

  /** Materials metadata (optional — may be empty if default materials) */
  materials?: {
    /** Hash of the skin layer configuration */
    skinLayerHash: string;

    /** List of region IDs that have independent material assignments */
    regions: string[];
  };

  /** Render metadata */
  render?: {
    /** Hash of the projection parameters (distance4d, spp, maxDepth, envExposure) */
    projectionHash?: string;

    /** Hash of the runtime fingerprint (GPU, driver, JS heap snapshot) */
    runtimeFingerprint?: string;

    /** Identifier of the specific render invocation */
    renderId?: string;

    /** Hash of the rendered pixel buffer (PNG or EXR) */
    pngHash?: string;
  };

  /** Status tracking */
  status: "partial" | "verified";
}