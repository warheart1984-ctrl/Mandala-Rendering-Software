import { ShaderNode } from "./ShaderNode.js";

export function createBuiltinNode(id, type, options = {}) {
  const def = NODE_DEFS[type];
  if (!def) throw new Error(`Unknown node type: ${type}`);
  return new ShaderNode(id, type, { ...def, ...options });
}

const floatInput = { inputs: [{ name: "a", type: "float" }, { name: "b", type: "float" }], outputs: [{ name: "out", type: "float" }] };
const vecInput = { inputs: [{ name: "a", type: "vec3" }, { name: "b", type: "vec3" }], outputs: [{ name: "out", type: "vec3" }] };

export const NODE_DEFS = {
  // Inputs
  float: { label: "Float", inputs: [], outputs: [{ name: "out", type: "float" }], params: { value: 0.0 } },
  vec2: { label: "Vec2", inputs: [], outputs: [{ name: "out", type: "vec2" }], params: { x: 0, y: 0 } },
  vec3: { label: "Vec3", inputs: [], outputs: [{ name: "out", type: "vec3" }], params: { r: 1, g: 1, b: 1 } },
  vec4: { label: "Vec4", inputs: [], outputs: [{ name: "out", type: "vec4" }], params: { r: 1, g: 1, b: 1, a: 1 } },
  color: { label: "Color", inputs: [], outputs: [{ name: "out", type: "color" }], params: { r: 1, g: 1, b: 1, a: 1 } },
  time: { label: "Time", inputs: [], outputs: [{ name: "out", type: "float" }], params: {} },
  uv: { label: "UV", inputs: [], outputs: [{ name: "out", type: "vec2" }], params: {} },
  normal: { label: "Normal", inputs: [], outputs: [{ name: "out", type: "vec3" }], params: {} },
  position: { label: "Position", inputs: [], outputs: [{ name: "out", type: "vec3" }], params: {} },
  vertexColor: { label: "Vertex Color", inputs: [], outputs: [{ name: "out", type: "color" }], params: {} },

  // Math (float)
  add: { label: "Add", ...floatInput, params: {} },
  subtract: { label: "Subtract", ...floatInput, params: {} },
  multiply: { label: "Multiply", ...floatInput, params: {} },
  divide: { label: "Divide", ...floatInput, params: {} },
  pow: { label: "Power", ...floatInput, params: {} },
  min: { label: "Min", ...floatInput, params: {} },
  max: { label: "Max", ...floatInput, params: {} },

  // Math (vec3)
  vec3Add: { label: "Vec3 Add", ...vecInput, params: {} },
  vec3Sub: { label: "Vec3 Subtract", ...vecInput, params: {} },
  vec3Mul: { label: "Vec3 Multiply", ...vecInput, params: {} },
  cross: { label: "Cross Product", ...vecInput, params: {} },
  dot: { label: "Dot Product", ...vecInput, params: {} },
  normalize: { label: "Normalize", inputs: [{ name: "a", type: "vec3" }], outputs: [{ name: "out", type: "vec3" }], params: {} },
  length: { label: "Length", inputs: [{ name: "a", type: "vec3" }], outputs: [{ name: "out", type: "float" }], params: {} },

  // Trigonometric
  sin: { label: "Sin", inputs: [{ name: "a", type: "float" }], outputs: [{ name: "out", type: "float" }], params: {} },
  cos: { label: "Cos", inputs: [{ name: "a", type: "float" }], outputs: [{ name: "out", type: "float" }], params: {} },
  tan: { label: "Tan", inputs: [{ name: "a", type: "float" }], outputs: [{ name: "out", type: "float" }], params: {} },
  abs: { label: "Abs", inputs: [{ name: "a", type: "float" }], outputs: [{ name: "out", type: "float" }], params: {} },
  floor: { label: "Floor", inputs: [{ name: "a", type: "float" }], outputs: [{ name: "out", type: "float" }], params: {} },
  ceil: { label: "Ceil", inputs: [{ name: "a", type: "float" }], outputs: [{ name: "out", type: "float" }], params: {} },
  fract: { label: "Fract", inputs: [{ name: "a", type: "float" }], outputs: [{ name: "out", type: "float" }], params: {} },
  clamp: { label: "Clamp", inputs: [{ name: "a", type: "float" }, { name: "min", type: "float" }, { name: "max", type: "float" }], outputs: [{ name: "out", type: "float" }], params: {} },
  lerp: { label: "Lerp", inputs: [{ name: "a", type: "float" }, { name: "b", type: "float" }, { name: "t", type: "float" }], outputs: [{ name: "out", type: "float" }], params: {} },
  smoothstep: { label: "Smoothstep", inputs: [{ name: "edge0", type: "float" }, { name: "edge1", type: "float" }, { name: "x", type: "float" }], outputs: [{ name: "out", type: "float" }], params: {} },

  // Composition
  combineVec2: { label: "Combine Vec2", inputs: [{ name: "x", type: "float" }, { name: "y", type: "float" }], outputs: [{ name: "out", type: "vec2" }], params: {} },
  combineVec3: { label: "Combine Vec3", inputs: [{ name: "r", type: "float" }, { name: "g", type: "float" }, { name: "b", type: "float" }], outputs: [{ name: "out", type: "vec3" }], params: {} },
  splitVec3: { label: "Split Vec3", inputs: [{ name: "v", type: "vec3" }], outputs: [{ name: "r", type: "float" }, { name: "g", type: "float" }, { name: "b", type: "float" }], params: {} },

  // 4D specific
  hyperplaneNormal: { label: "Hyperplane Normal", inputs: [], outputs: [{ name: "out", type: "vec4" }], params: {} },
  rotationWeight: { label: "Rotation Weight", inputs: [], outputs: [{ name: "out", type: "float" }], params: { plane: "xw", value: 0.7 } },
  pos4D: { label: "4D Position", inputs: [], outputs: [{ name: "out", type: "vec4" }], params: {} },
  project4Dto3D: { label: "4D→3D", inputs: [{ name: "v4", type: "vec4" }], outputs: [{ name: "out", type: "vec3" }], params: { d4: 4.0 } },

  // Output
  fragmentColor: { label: "Fragment Color", inputs: [{ name: "color", type: "color" }], outputs: [], params: {} },
  fragmentNormal: { label: "Fragment Normal", inputs: [{ name: "normal", type: "vec3" }], outputs: [], params: {} },
  fragmentEmission: { label: "Fragment Emission", inputs: [{ name: "color", type: "color" }], outputs: [], params: {} },
  fragmentAlpha: { label: "Fragment Alpha", inputs: [{ name: "alpha", type: "float" }], outputs: [], params: {} },
};
