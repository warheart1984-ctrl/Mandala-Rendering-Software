# Inspector UI Color Theme Spec

**Path:** `Assets/Engine/Inspector/UI/theme.md`  
**Status:** **declared** design language for Unity Editor window. Not enforced by code until UI Toolkit / IMGUI styles apply these tokens.

## Color philosophy

Colors are semantic, not decorative. Each category uses a distinct hue to reinforce cognitive grouping.

## Color palette

| Category | Color (Hex) | Meaning |
| --- | --- | --- |
| Position & Projection | `#D0D0D0` | Neutral, foundational |
| Differential Geometry | `#7FB3D5` | Analytical, mathematical |
| Jacobian | `#82E0AA` | Transformative, derivative |
| Rotation Planes | `#F5CBA7` | Dynamic, angular |
| Hyperplane Intersections | `#C39BD3` | Abstract, constraint-based |
| Local Topology | `#F1948A` | Structural, connective |
| Shader Debugging | `#F7DC6F` | Visual, evaluative (**future** section) |
| Evidence Bundle Metadata | `#BFC9CA` | Constitutional, archival |

## UI rules

### Rule 1 — Section headers

Each section header uses its category color as:

- left border  
- header background (10% opacity)  
- icon accent  

### Rule 2 — Numeric fields

Numeric fields use:

- white background  
- category-colored label text  
- category-colored underline on focus  

### Rule 3 — Matrices

Matrices use:

- alternating row shading  
- category-colored grid lines  
- bold category-colored row labels  

### Rule 4 — On-plane indicators

Hyperplane “on-plane” entries use:

- category color (`#C39BD3`)  
- 20% opacity highlight  
- bold text  

### Rule 5 — Boundary flags

Topology boundary flag uses:

- red accent (`#E74C3C`) for boundary  
- green accent (`#27AE60`) for interior  

## Implementation note

`MRS4DInspectorWindow` is currently a **skeleton** EditorWindow. Applying this theme is a follow-up UI task; mockups: [`WIREFRAME_FULL.md`](./WIREFRAME_FULL.md).
