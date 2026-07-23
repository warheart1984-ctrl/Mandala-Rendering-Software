export class Port {
  constructor(name, type, direction, node) {
    this.name = name;
    this.type = type;
    this.direction = direction;
    this.node = node;
    this.connection = null;
  }

  connect(port) {
    if (this.direction === port.direction) return false;
    this.connection = port;
    port.connection = this;
    return true;
  }

  disconnect() {
    if (this.connection) this.connection.connection = null;
    this.connection = null;
  }

  get value() {
    return this.connection ? this.connection.node.output(this.connection.name) : null;
  }
}

const PORT_TYPES = ["float", "vec2", "vec3", "vec4", "color", "mat4", "sampler"];

export class ShaderNode {
  constructor(id, type, options = {}) {
    this.id = id;
    this.type = type;
    this.label = options.label ?? type;
    this.inputs = {};
    this.outputs = {};
    this.params = options.params ?? {};
    this._setupPorts(options);
  }

  _setupPorts(options) {
    const inputs = options.inputs ?? [];
    for (const inp of inputs) {
      this.inputs[inp.name] = new Port(inp.name, inp.type, "input", this);
    }
    const outputs = options.outputs ?? [{ name: "out", type: "float" }];
    for (const out of outputs) {
      this.outputs[out.name] = new Port(out.name, out.type, "output", this);
    }
  }

  getInput(name) {
    return this.inputs[name];
  }

  getOutput(name = "out") {
    return this.outputs[name];
  }

  connect(fromPort, toNode, toPortName) {
    const toPort = toNode.getInput(toPortName);
    if (!toPort) return false;
    return fromPort.connect(toPort);
  }

  disconnectAll() {
    for (const p of Object.values(this.inputs)) p.disconnect();
    for (const p of Object.values(this.outputs)) p.disconnect();
  }

  static PORT_TYPES = PORT_TYPES;
}
