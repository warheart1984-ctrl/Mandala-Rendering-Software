# FourDAdapter — documented smoke (no Play Mode CI)

**Status:** **partial** — manual / Unity Editor verification only.

## Automated (repo)

- C# compile: covered only when Unity batchmode CI is added (not in default `ci.yml` today).

## Manual smoke (~2 min)

1. Open `unity/GovernedUnityProject/` in Unity 2022 LTS+.
2. Create empty scene with `FourDSceneLoader` on a GameObject.
3. In Play Mode or via a tiny test harness, call:

```csharp
loader.LoadScene3DJson(@"
{
  ""schemaVersion"": ""scene3d-v1"",
  ""id"": ""smoke-1"",
  ""entities"": [{ ""id"": ""e1"", ""name"": ""SmokeCube"" }]
}");
```

4. Expect hierarchy `Scene3D_smoke-1/SmokeCube` (placeholder cube primitive).

## Honest limits

- No MeshFilter import from Scene3D mesh payloads yet.
- No automated Play Mode job in GitHub Actions.
