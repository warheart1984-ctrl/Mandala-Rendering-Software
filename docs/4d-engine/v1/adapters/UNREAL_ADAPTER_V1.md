# Unreal Adapter v1 — Module Design

> **Drive-G-1:** This document **declares** a plugin architecture.  
> In-repo evidence today is a **skeleton** under `unreal/FourDAdapter/` (headers, Build.cs, module stubs).  
> It does **not** claim that Unreal Editor tools, material assets, or a CI Unreal build are working.

**Status:** **skeleton** (plugin tree) + **declared** (materials, editor UX, workflow)

---

## 1. Purpose

The Unreal Adapter **consumes** Projection & Lineage Protocol (PLP) artifacts:

| Artifact | Role |
| --- | --- |
| `scene3D` | Projected 3D scene (nodes, meshes, materials) ready for Unreal Actors / meshes |
| `lineageBundle` | Maps Unreal objects back to 4D origins (Node4D, Mesh4D, Camera4D, Slice3D, W-band) |

**Constitutional boundary:** Unreal does **not** compute 4D. Authority for WorldDocument, observation, and projection remains with the 4D Engine / PLP pipeline (hybrid-first). The adapter instantiates and visualizes projected output only.

Parity note: Unity’s `FourDAdapter` follows the same consume-only contract — see [UNITY_ADAPTER_V1.md](./UNITY_ADAPTER_V1.md) when present.

---

## 2. Plugin and modules

| Item | Name |
| --- | --- |
| Plugin | `FourDAdapter` |
| Runtime module | `FourDAdapterRuntime` |
| Editor module | `FourDAdapterEditor` |

### Directory layout

```
Plugins/FourDAdapter/
  FourDAdapter.uplugin
  README.md
  Source/
    FourDAdapterRuntime/
      FourDAdapterRuntime.Build.cs
      Public/
        FourDAdapterRuntime.h
        FourDSceneLoader.h
        FourDLineageRegistry.h
        FourDLineageEntry.h
        FourDMaterialMapper.h
        FourDBlueprintLibrary.h
        FourDScene3DTypes.h
      Private/
        FourDAdapterRuntimeModule.cpp
        FourDSceneLoader.cpp
        FourDLineageRegistry.cpp
        FourDMaterialMapper.cpp
        FourDBlueprintLibrary.cpp
    FourDAdapterEditor/
      FourDAdapterEditor.Build.cs
      Public/
        FourDAdapterEditor.h
        FourDImporterCommands.h
        FourDImporterStyle.h
      Private/
        FourDImporterEditorModule.cpp
        FourDImporterWindow.cpp
        FourDSliceControllerPanel.cpp
        FourDLineageDetailsCustomization.cpp
        FourDMaterialDetailsCustomization.cpp
```

**Repo path (skeleton):** `unreal/FourDAdapter/` — peer of `unreal/GovernedEnginePlugin/`, intended to be copied or enabled as `Project/Plugins/FourDAdapter/`. Engine version is left flexible in `.uplugin`; open against a local UE install to verify.

---

## 3. Runtime module design

### 3.1 `UFourDSceneLoader`

**Purpose:** Load `scene3D` and instantiate Actors, Static Meshes, and Materials.

**Responsibilities (declared):**

- Parse JSON/binary `scene3D`
- Create `AActor` hierarchy for nodes
- Create `UStaticMesh` assets for meshes
- Create `UMaterialInstance` assets for materials
- Register lineage with `UFourDLineageRegistry`

**Core API (skeleton stubs):**

```cpp
UCLASS()
class FOURDADAPTERRUNTIME_API UFourDSceneLoader : public UObject
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	bool LoadSceneFromFile(const FString& ScenePath, FScene3D& OutScene);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	AActor* SpawnNodeActor(const FScene3DNode& Node, UWorld* World);

	UStaticMesh* CreateStaticMesh(const FScene3DMesh& Mesh);
	UMaterialInstance* CreateMaterialInstance(const FScene3DMaterial& Mat);
};
```

### 3.2 `FFourDLineageEntry` / `UFourDLineageRegistry`

**Purpose:** Maintain mapping from Unreal objects to lineage entries; query for editor tools and Blueprints.

```cpp
USTRUCT(BlueprintType)
struct FOURDADAPTERRUNTIME_API FFourDLineageEntry
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	int32 LineageId = 0;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	int32 Node4D = 0;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	int32 Mesh4D = 0;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	int32 Camera4D = 0;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	int32 Slice3D = 0;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	float WMin = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	float WMax = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "4D Adapter")
	FString ProjectionType;
};

UCLASS()
class FOURDADAPTERRUNTIME_API UFourDLineageRegistry : public UObject
{
	GENERATED_BODY()

public:
	static UFourDLineageRegistry* Get(UWorld* World);

	void RegisterLineage(UObject* Object, const FFourDLineageEntry& Entry);
	bool GetLineage(UObject* Object, FFourDLineageEntry& OutEntry) const;
	void QueryByWBand(float WMin, float WMax, TArray<UObject*>& OutObjects) const;
};
```

### 3.3 `UFourDMaterialMapper`

**Purpose:** Map 4D material properties to Unreal material parameters (W-depth encoding, ghosting opacity, visualization modes).

```cpp
UCLASS()
class FOURDADAPTERRUNTIME_API UFourDMaterialMapper : public UObject
{
	GENERATED_BODY()

public:
	void ApplyWEncoding(UMaterialInstance* MatInst, float WDepth);
	void ApplyGhosting(UMaterialInstance* MatInst, float GhostOpacity);
};
```

### 3.4 `UFourDBlueprintLibrary`

Exposes W-aware helpers to Blueprints (skeleton):

```cpp
UCLASS()
class FOURDADAPTERRUNTIME_API UFourDBlueprintLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	static bool GetLineageForActor(AActor* Actor, FFourDLineageEntry& OutEntry);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	static void SetWSlice(UObject* WorldContextObject, float WMin, float WMax);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	static void SetGhosting(UObject* WorldContextObject, bool bEnabled, int32 NeighborCount, float OpacityFalloff);

	UFUNCTION(BlueprintCallable, Category = "4D Adapter")
	static void SetWDepthMode(UObject* WorldContextObject, int32 Mode);
};
```

---

## 4. Material graph integration (**declared**)

No `.uasset` materials ship in this skeleton. The following names and parameters are **declared** for a future Content package.

### 4.1 `M_FourDBase`

| Parameter | Type | Notes |
| --- | --- | --- |
| `BaseColor` | Vector | |
| `WDepth` | Scalar | |
| `WGradientTex` | Texture2D | |
| `GhostOpacity` | Scalar | |
| `WDepthMode` | Scalar | `0`=off, `1`=heatmap, `2`=contour |

**Conceptual graph:** sample `WGradientTex` by `WDepth` → multiply `BaseColor`; multiply opacity by `GhostOpacity`; if heatmap/contour mode, override color mapping.

### 4.2 `M_FourDGhost`

Derived from `M_FourDBase` — lower opacity via `GhostOpacity`; optional desaturation/blur for ghosted neighbor slices.

### 4.3 `M_FourDDepth`

Specialized W-depth visualization driven by `WDepth` / `WDepthMode`.

---

## 5. Editor module design (**declared** / stubs)

### 5.1 `FFourDImporterEditorModule`

Register menus, commands, panels, and details customizations:

- “Import 4D Projection” menu / content-browser entry
- Register `SFourDImporterWindow` and `SFourDSliceControllerPanel`
- Register lineage and material details customizations

### 5.2 `SFourDImporterWindow`

File pickers for `scene3D` + `lineageBundle`, “Import Projection” button, summary counts. Calls `UFourDSceneLoader`, spawns into the current level, populates `UFourDLineageRegistry`.

### 5.3 `SFourDSliceControllerPanel`

Global W-slice / visualization controller: W slider or WMin/WMax, ghosting toggle, neighbor count, opacity falloff, W-depth mode dropdown. Queries registry; adjusts material instance params; optionally hides out-of-band objects.

### 5.4 Details customizations

| Class | Shows |
| --- | --- |
| `FFourDLineageDetailsCustomization` | Node4D / Mesh4D / Camera4D / Slice3D, W band, projection type |
| `FFourDMaterialDetailsCustomization` | WDepth, WGradientTex, GhostOpacity, WDepthMode |

---

## 6. Typical Unreal workflow (**declared**)

1. Install / enable `FourDAdapter` plugin.
2. Open FourD Importer window.
3. Select `scene3D` and `lineageBundle` files (PLP outputs).
4. Click **Import Projection** → Actors, meshes, materials created.
5. Open **4D Slice Controller** panel; adjust W-slice, ghosting, W-depth mode.
6. Inspect an Actor’s Details → lineage fields.
7. Drive W-slice from Blueprints / Sequencer (cinematics or interactive).

---

## 7. Extension points (v2+ / **roadmap**)

- Runtime W-navigation for gameplay
- Multi-projection management (cameras / ObservationModes)
- Sequencer integration for W-axis animation
- Bidirectional live updates with the 4D Engine

---

## 8. Status table (evidence-bound)

| Surface | Status | Evidence |
| --- | --- | --- |
| Design doc (this file) | **declared** | `docs/4d-engine/v1/adapters/UNREAL_ADAPTER_V1.md` |
| Plugin descriptor + Build.cs | **skeleton** | `unreal/FourDAdapter/FourDAdapter.uplugin`, `*.Build.cs` |
| Runtime UCLASS/USTRUCT stubs | **skeleton** | headers + empty / NotImplemented cpp |
| Editor module registration stubs | **skeleton** | `FourDImporterEditorModule.cpp` et al. |
| Material assets `M_FourD*` | **declared** | no `.uasset` in repo |
| Importer / Slice UI behavior | **declared** | stubs only; not exercised |
| UE compile / CI | **not claimed** | no Unreal toolchain gate in CI |
| Computes 4D / PLP projection | **out of scope** | consumes PLP only |

---

## Cross-links

- Index: [../README.md](../README.md)
- PLP: [../plp/PLP_V1.md](../plp/PLP_V1.md) (when present)
- Unity adapter: [UNITY_ADAPTER_V1.md](./UNITY_ADAPTER_V1.md) (when present)
- Plugin README: [`unreal/FourDAdapter/README.md`](../../../unreal/FourDAdapter/README.md)
