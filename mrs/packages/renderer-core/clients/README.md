# 4D Renderer — Game Engine Clients

## Unity

1. Copy `clients/unity/FourDRenderLink.cs` into your `Assets/Scripts/` folder
2. Copy `clients/unity/Editor/FourDRenderLinkEditor.cs` into `Assets/Editor/`
3. Attach the `FourDRenderLink` component to any GameObject in your scene
4. Set `Server URL` to `ws://127.0.0.1:9487`
5. Hit Play — meshes stream in as GameObjects with standard materials

**Inspect:** Click on a mesh in the Game view to send an inspect ray to the 4D renderer. Results appear in the Console.

## Unreal Engine 5

1. Copy `clients/unreal/` into your project's `Plugins/` folder
2. Regenerate project files
3. Enable the "4D Render Link" plugin in Edit > Plugins
4. Add a `FourDRenderLinkComponent` to any Actor in your level
5. Set `Server URL` to `ws://127.0.0.1:9487`

**Blueprint nodes:** Bind to `On Mesh Received`, `On State Snapshot`, and `On Inspect Result` events for custom logic.

## Protocol

Both clients speak the same JSON-over-WebSocket protocol defined by `src/live-link/`:

- `mesh_update` — base64-encoded positions + indices
- `state_snapshot` — entity transforms with 4D→3D projection
- `inspect_screen` / `inspect_ray` / `inspect_primitive` — bidirectional inspection
- `inspect_result` — normals, curvature, topology, hyperplane distances
