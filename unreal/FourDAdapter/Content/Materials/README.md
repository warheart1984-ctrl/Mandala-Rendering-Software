# FourDAdapter Content — Materials (**declared**)

> **Drive-G-1:** No `.uasset` binaries ship in this skeleton. Author the following inside a local Unreal project.  
> Graph contracts: [`docs/4d-engine/v1/adapters/UNREAL_MATERIAL_FUNCTIONS.md`](../../../docs/4d-engine/v1/adapters/UNREAL_MATERIAL_FUNCTIONS.md)

## Material functions (declared assets to author)

| Asset | Role |
| --- | --- |
| `MF_WDepthGradient` | Sample W gradient LUT |
| `MF_WGhostOpacity` | Neighbor ghost opacity |
| `MF_WHeatmap` | W heatmap remap (`WDepthMode == 1`) |
| `MF_WContourBands` | Contour banding (`WDepthMode == 2`) |

## Materials (declared)

| Asset | Role |
| --- | --- |
| `M_FourDBase` | Base projected shading |
| `M_FourDGhost` | Ghost neighbor look |
| `M_FourDDepth` | Depth-viz specialization |

## Compute (**roadmap**)

`CS_WEncoding` — see [`UNREAL_W_ENCODING_COMPUTE.md`](../../../docs/4d-engine/v1/adapters/UNREAL_W_ENCODING_COMPUTE.md). Not present.
