import { ShaderNode } from "./ShaderNode.js";
import { createBuiltinNode, NODE_DEFS } from "./BuiltinNodes.js";

export class ShaderGraph {
  constructor() {
    this.nodes = [];
    this._nodeMap = new Map();
  }

  createNode(type, id, options = {}) {
    const nodeId = id ?? `${type}_${this.nodes.length}`;
    if (this._nodeMap.has(nodeId)) throw new Error(`Node "${nodeId}" already exists`);
    const node = createBuiltinNode(nodeId, type, options);
    this.nodes.push(node);
    this._nodeMap.set(nodeId, node);
    return node;
  }

  removeNode(id) {
    const node = this._nodeMap.get(id);
    if (!node) return false;
    node.disconnectAll();
    this.nodes = this.nodes.filter((n) => n.id !== id);
    this._nodeMap.delete(id);
    return true;
  }

  getNode(id) {
    return this._nodeMap.get(id);
  }

  connect(fromNodeId, fromPort, toNodeId, toPort) {
    const fromNode = this._nodeMap.get(fromNodeId);
    const toNode = this._nodeMap.get(toNodeId);
    if (!fromNode || !toNode) return false;
    const fp = fromNode.getOutput(fromPort);
    const tp = toNode.getInput(toPort);
    if (!fp || !tp) return false;
    return fp.connect(tp);
  }

  disconnect(fromNodeId, fromPort) {
    const node = this._nodeMap.get(fromNodeId);
    if (!node) return;
    const port = node.getOutput(fromPort);
    if (port) port.disconnect();
  }

  topologicalSort() {
    const visited = new Set();
    const sorted = [];

    const visit = (node) => {
      if (visited.has(node.id)) return;
      visited.add(node.id);
      for (const input of Object.values(node.inputs)) {
        if (input.connection) {
          visit(input.connection.node);
        }
      }
      sorted.push(node);
    };

    for (const node of this.nodes) visit(node);
    return sorted;
  }

  getOutputNodes() {
    return this.nodes.filter((n) => n.type === "fragmentColor" || n.type === "fragmentNormal" || n.type === "fragmentEmission" || n.type === "fragmentAlpha");
  }

  validate() {
    const errors = [];
    for (const node of this.nodes) {
      for (const inp of Object.values(node.inputs)) {
        if (inp.connection === null && inp.name !== "color") {
          const skipOpt = NODE_DEFS[node.type]?.inputs?.find((d) => d.name === inp.name)?.optional;
          if (!skipOpt) errors.push(`Node "${node.id}" input "${inp.name}" is unconnected`);
        }
      }
    }
    const outputs = this.getOutputNodes();
    if (outputs.length === 0) errors.push("Graph has no output node (fragmentColor)");
    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    const nodes = [];
    for (const node of this.nodes) {
      const conns = {};
      for (const [name, port] of Object.entries(node.inputs)) {
        if (port.connection) {
          conns[name] = { node: port.connection.node.id, port: port.connection.name };
        }
      }
      nodes.push({ id: node.id, type: node.type, params: node.params, connections: conns });
    }
    return { nodes };
  }

  static fromJSON(json) {
    const graph = new ShaderGraph();
    const nodeMap = {};
    for (const nd of json.nodes) {
      const node = graph.createNode(nd.type, nd.id, { params: nd.params });
      nodeMap[nd.id] = node;
    }
    for (const nd of json.nodes) {
      for (const [portName, conn] of Object.entries(nd.connections)) {
        graph.connect(conn.node, conn.port, nd.id, portName);
      }
    }
    return graph;
  }
}
