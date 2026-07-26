# 4DRS + Engine3D Extensions v1.2 and v2.0 Charter

## v1.2 Simulation and Procedural Worlds

Physics adds deterministic fixed-step rigid bodies:

- `RigidBody`: mass, restitution, friction, collider, dynamic flag
- colliders: sphere, box, capsule, convex mesh
- `PhysicsWorld`: gravity and bodies

Particles add deterministic emitters:

- point, sphere, and box emitters
- billboard, volumetric point, energy spark, and neon lattice rendering modes

Procedural generation adds:

- `WorldGenerator`: id, seed, params, and `generate()`
- city, studio, void, mandala, and cosmic generator families

Evidence v1.2 adds:

- `physicsHash`
- `particleHash`
- `worldGeneratorHash`

## v2.0 Federated Rendering

`FederatedWorld` contains:

- `worlds: Engine3DWorld[]`
- `links: WorldLink[]`
- `timeline: FederationTimeline`

`WorldLink` declares:

- source world
- target world
- transform
- visibility mask

SceneBridge federation must merge worlds, resolve material conflicts, unify lighting, choose camera state, and emit one RT4D scene.

Evidence v2.0 adds:

- `federationHash`
- `worldLinkHash`
- `timelineHash`
- `multiWorldMaterialHash`

## Constitutional Charter

4DRS is governed by the CIEMS sovereignty stack:

Constitution -> Specification -> Conformance -> Implementation -> Deployment -> Stewardship

No render may occur outside the evidence chain. Every render declares intent, deterministic inputs, world state, materials, lights, cameras, rigs, physics, particles, checksum, and replay status.

Replay is a constitutional right: any frame, timeline, or world must be reconstructable, re-renderable, and re-hashable from its evidence.
