# math3d

Status: **partial**, with the median-split `BVH3D` explicitly **skeleton**.

This module provides tested foundational 3D math, transforms, queries,
deterministic seeded noise, fixed-step integration, camera projection, and
picking helpers. `RigidBody3D` and `PhysicsWorld3D` are dimension-constrained
facades over the existing 4D physics classes: their fourth coordinate is
clamped to `w = 0`.

The module does not claim a complete physics engine, optimized production BVH,
shader pipeline, or Unity/Unreal parity. Collision response remains the behavior
provided by the existing 4D substrate and its collider types.
