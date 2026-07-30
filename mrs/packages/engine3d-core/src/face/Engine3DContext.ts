/**
 * Engine3D contexts for Amendment VII/VIII world-profile Apply.
 * Matches user patch: Engine3DObjectContext / Engine3DWorldContext / RenderContext.
 * Status: **partial**
 */

export type Engine3DObjectType =
  | "human"
  | "animal"
  | "plant"
  | "architecture"
  | "terrain"
  | "water"
  | "synthetic"
  | "material"
  | "biogeometric"
  | "unknown";

export interface Engine3DObjectContext {
  readonly id: string;
  readonly type: Engine3DObjectType | string;
  /** e.g. "architecture.room", "terrain.field", "world.plant" */
  readonly worldProfile: string;
  readonly parentContext?: {
    readonly objectId?: string;
    readonly scaleClass?: string;
    readonly type?: string;
  };
  readonly terrainContext?: {
    readonly profileId?: string;
    readonly worldScaleClass?: string;
  };
  readonly architectureContext?: {
    readonly profileId?: string;
    readonly worldScaleClass?: string;
  };
  readonly materialContext?: {
    readonly materialId?: string;
    readonly worldScaleClass?: string;
  };
  readonly scaleClass?: string;
}

export interface Engine3DWorldContext {
  /** Numeric scale factor or landmark meters proxy */
  readonly scaleContext: number;
  readonly parentScaleContext?: number;
  /** e.g. "interior.dim-room", "exterior.field" */
  readonly context: string;
  readonly worldScaleClass?: string;
  readonly worldProfileId?: string;
}

export interface RenderContext {
  readonly object: Engine3DObjectContext;
  readonly world: Engine3DWorldContext;
  readonly scaleClassOrProfileId?: string;
  readonly requireWorldContext?: boolean;
}

/** Map object.type → CKL world.* policy id. */
export function worldPolicyForObjectType(
  type: string | undefined | null,
): string | null {
  const t = String(type ?? "")
    .trim()
    .toLowerCase();
  const map: Record<string, string> = {
    human: "world.biogeometric",
    animal: "world.biogeometric",
    biogeometric: "world.biogeometric",
    plant: "world.plant",
    architecture: "world.architecture",
    terrain: "world.terrain",
    water: "world.water",
    synthetic: "world.synthetic",
    material: "world.material",
  };
  return map[t] ?? null;
}

/** Convert RenderContext → CKL world-entity evidence shape. */
export function renderContextToWorldEntity(ctx: RenderContext) {
  const { object, world } = ctx;
  const worldProfileId =
    object.worldProfile?.startsWith("world.")
      ? object.worldProfile
      : worldPolicyForObjectType(object.type) ?? object.worldProfile;
  return {
    id: object.id,
    objectType: String(object.type),
    type: String(object.type),
    worldProfileId,
    scaleClass:
      object.scaleClass ??
      world.worldScaleClass ??
      (world.scaleContext > 0 ? "human-sized" : null),
    worldContext: {
      worldId: world.context,
      worldProfileId: world.worldProfileId ?? worldProfileId,
      worldScaleClass: world.worldScaleClass,
      biomeTag: world.context,
    },
    parentContext: object.parentContext
      ? {
          objectId: object.parentContext.objectId,
          scaleClass: object.parentContext.scaleClass,
          objectType: object.parentContext.type,
        }
      : undefined,
    terrainContext: object.terrainContext,
    architectureContext: object.architectureContext,
    architecturalContext: object.architectureContext,
    materialContext: object.materialContext,
  };
}
