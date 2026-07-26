import type { World3D } from "../world/World3D.js";

export interface BuiltScene {
  vertexCount: number;
  indexCount: number;
  bodyCount: number;
}

export interface SceneBuilder {
  buildScene(world: World3D): BuiltScene;
}

export class DefaultSceneBuilder implements SceneBuilder {
  lastScene: BuiltScene | null = null;

  buildScene(world: World3D): BuiltScene {
    const scene: BuiltScene = {
      vertexCount: Math.floor(world.mesh.vertices.length / 3),
      indexCount: world.mesh.indices.length,
      bodyCount: world.bodies.length,
    };
    this.lastScene = scene;
    return scene;
  }
}
