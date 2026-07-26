import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultRendererCore } from "../../src/renderer/RendererCore.js";
import { DefaultSceneBuilder } from "../../src/renderer/SceneBuilder.js";
import { DefaultShaderPrograms } from "../../src/renderer/ShaderPrograms.js";
import { DefaultWorld3D } from "../../src/world/World3D.js";
import { DefaultWorldMesh } from "../../src/world/WorldMesh.js";
import { createDefaultMaterial } from "../../src/renderer/shaders/Material.js";

describe("renderer-basic", () => {
  it("buildScene + setUniforms called on null backend", () => {
    const sceneBuilder = new DefaultSceneBuilder();
    const shaders = new DefaultShaderPrograms();
    const renderer = new DefaultRendererCore(
      sceneBuilder,
      shaders,
      createDefaultMaterial(),
    );
    const world = new DefaultWorld3D(
      new DefaultWorldMesh(
        new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
        new Uint32Array([0, 1, 2]),
      ),
    );
    renderer.render(world, {
      colors: new Float32Array([1, 1, 1, 1]),
      scales: new Float32Array([1]),
      shaderParams: { substrateIntensity: 0.5 },
    });
    assert.ok(sceneBuilder.lastScene);
    assert.equal(sceneBuilder.lastScene.vertexCount, 3);
    assert.equal(shaders.useCount, 1);
    assert.equal(shaders.lastUniforms["substrateIntensity"], 0.5);
    assert.equal(renderer.renderCount, 1);
  });
});
