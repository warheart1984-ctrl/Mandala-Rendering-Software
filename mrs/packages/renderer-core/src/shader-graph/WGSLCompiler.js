import { ShaderGraph } from "./ShaderGraph.js";

const TYPE_MAP = {
  float: "f32",
  vec2: "vec2<f32>",
  vec3: "vec3<f32>",
  vec4: "vec4<f32>",
  color: "vec4<f32>",
  mat4: "mat4x4<f32>",
  sampler: "sampler",
};

function wgslType(portType) {
  return TYPE_MAP[portType] ?? "f32";
}

function wgslLiteral(node) {
  switch (node.type) {
    case "float": return `${node.params.value ?? 0.0}f`;
    case "vec2": return `vec2<f32>(${node.params.x ?? 0}f, ${node.params.y ?? 0}f)`;
    case "vec3": return `vec3<f32>(${node.params.r ?? 1}f, ${node.params.g ?? 1}f, ${node.params.b ?? 1}f)`;
    case "vec4": return `vec4<f32>(${node.params.r ?? 1}f, ${node.params.g ?? 1}f, ${node.params.b ?? 1}f, ${node.params.a ?? 1}f)`;
    case "color": return `vec4<f32>(${node.params.r ?? 1}f, ${node.params.g ?? 1}f, ${node.params.b ?? 1}f, ${node.params.a ?? 1}f)`;
    default: return null;
  }
}

function intrinsicName(type) {
  const map = {
    "add": " + ", "subtract": " - ", "multiply": " * ", "divide": " / ",
    "vec3Add": " + ", "vec3Sub": " - ", "vec3Mul": " * ",
    "sin": "sin", "cos": "cos", "tan": "tan", "abs": "abs",
    "floor": "floor", "ceil": "ceil", "fract": "fract",
    "normalize": "normalize", "length": "length", "dot": "dot", "cross": "cross",
    "pow": "pow", "min": "min", "max": "max",
  };
  return map[type];
}

function binaryExpr(type, a, b) {
  const op = intrinsicName(type);
  if (["add","subtract","multiply","divide","vec3Add","vec3Sub","vec3Mul"].includes(type)) {
    return `(${a}${op}${b})`;
  }
  if (["pow","min","max","dot"].includes(type)) {
    return `${op}(${a}, ${b})`;
  }
  if (type === "cross") return `cross(${a}, ${b})`;
  return null;
}

function unaryExpr(type, a) {
  const fn = intrinsicName(type);
  if (fn && ["sin","cos","tan","abs","floor","ceil","fract","normalize","length"].includes(type)) {
    return `${fn}(${a})`;
  }
  return null;
}

function multiArgExpr(type, args) {
  if (type === "clamp") return `clamp(${args[0]}, ${args[1]}, ${args[2]})`;
  if (type === "lerp") return `mix(${args[0]}, ${args[1]}, ${args[2]})`;
  if (type === "smoothstep") return `smoothstep(${args[0]}, ${args[1]}, ${args[2]})`;
  if (type === "combineVec2") return `vec2<f32>(${args[0]}, ${args[1]})`;
  if (type === "combineVec3") return `vec3<f32>(${args[0]}, ${args[1]}, ${args[2]})`;
  if (type === "splitVec3") return args[0];
  if (type === "project4Dto3D") {
    const d4 = 4.0;
    return `vec3<f32>(${args[0]}.x * ${d4}f / (${d4}f + ${args[0]}.w), ${args[0]}.y * ${d4}f / (${d4}f + ${args[0]}.w), ${args[0]}.z)`;
  }
  return null;
}

export class WGSLCompiler {
  constructor(graph) {
    this.graph = graph;
    this._varCount = 0;
  }

  _freshVar(prefix = "v") {
    return `${prefix}_${this._varCount++}`;
  }

  compile() {
    this._varCount = 0;
    const sorted = this.graph.topologicalSort();
    const stmts = [];
    const varMap = {};

    stmts.push("struct FragmentInput {");
    stmts.push("  @builtin(position) position: vec4<f32>;");
    stmts.push("  @location(0) uv: vec2<f32>;");
    stmts.push("  @location(1) normal: vec3<f32>;");
    stmts.push("  @location(2) worldPos: vec3<f32>;");
    stmts.push("  @location(3) vertexColor: vec4<f32>;");
    stmts.push("};");
    stmts.push("");

    for (const node of sorted) {
      const lit = wgslLiteral(node);
      if (lit !== null) {
        varMap[node.id] = lit;
        continue;
      }

      if (node.type === "time") {
        const v = this._freshVar("time");
        varMap[node.id] = v;
        stmts.push(`let ${v}: f32 = uniforms.time;`);
        continue;
      }

      if (node.type === "uv") {
        varMap[node.id] = `input.uv`;
        continue;
      }
      if (node.type === "normal") {
        varMap[node.id] = `input.normal`;
        continue;
      }
      if (node.type === "position") {
        varMap[node.id] = `input.worldPos`;
        continue;
      }
      if (node.type === "vertexColor") {
        varMap[node.id] = `input.vertexColor`;
        continue;
      }
      if (node.type === "hyperplaneNormal") {
        varMap[node.id] = `uniforms.hyperplaneNormal`;
        continue;
      }
      if (node.type === "rotationWeight") {
        varMap[node.id] = `${node.params.value ?? 0.7}f`;
        continue;
      }
      if (node.type === "pos4D") {
        varMap[node.id] = `uniforms.pos4D`;
        continue;
      }

      const inputs = Object.entries(node.inputs).filter(([_, p]) => p.connection);
      const args = inputs.map(([name, p]) => varMap[p.connection.node.id]);

      let expr = null;

      if (args.length === 2) expr = binaryExpr(node.type, args[0], args[1]);
      else if (args.length === 1) expr = unaryExpr(node.type, args[0]);
      else if (args.length >= 3) expr = multiArgExpr(node.type, args);

      if (expr === null) {
        const v = this._freshVar("tmp");
        varMap[node.id] = v;
        stmts.push(`let ${v}: f32 = 0.0; // unknown node ${node.type}`);
        continue;
      }

      if (node.type === "splitVec3") {
        const v = this._freshVar("v");
        varMap[node.id] = v;
        const base = args[0];
        stmts.push(`let ${v}_r: f32 = ${base}.r;`);
        stmts.push(`let ${v}_g: f32 = ${base}.g;`);
        stmts.push(`let ${v}_b: f32 = ${base}.b;`);
        stmts.push(`let ${v}: vec3<f32> = ${base};`);
        varMap[`${node.id}.r`] = `${v}_r`;
        varMap[`${node.id}.g`] = `${v}_g`;
        varMap[`${node.id}.b`] = `${v}_b`;
        continue;
      }

      const retType = wgslType(Object.values(node.outputs)[0]?.type ?? "float");
      const varName = this._freshVar("n");
      varMap[node.id] = varName;
      stmts.push(`let ${varName}: ${retType} = ${expr};`);
    }

    const outputNode = this.graph.getOutputNodes().find((n) => n.type === "fragmentColor");
    if (!outputNode) {
      throw new Error("No fragmentColor output node in graph");
    }

    const colorInput = outputNode.getInput("color");
    const colorExpr = colorInput?.connection ? varMap[colorInput.connection.node.id] : "vec4<f32>(1.0, 0.5, 0.2, 1.0)";

    stmts.push("");
    stmts.push("return @location(0) " + colorExpr + ";");

    const body = stmts.join("\n");

    const source = `@fragment
fn fs_main(input: FragmentInput) -> @location(0) vec4<f32> {
${body}
}
`;
    return source;
  }
}
