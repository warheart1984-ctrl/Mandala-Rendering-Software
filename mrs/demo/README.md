# MRS RT4D Demo Models

This folder contains small GLB files for testing and demonstration.

## Files

### basic-scene.glb

A minimal scene with one triangle mesh and one material. Useful for verifying the GLB to Scene4D to BVH4D pipeline.

## Render a still

```bash
node mrs/packages/renderer-core/scripts/render-still.mjs \
  --glb mrs/demo/basic-scene.glb \
  --width 512 --height 512 --spp 32 --seed 1 \
  --output renders/demo.png
```

## Render an animation

```bash
node mrs/packages/renderer-core/scripts/render-animation.mjs \
  --glb mrs/demo/basic-scene.glb \
  --frames 24 --width 256 --height 256 \
  --output-dir renders/anim
```
