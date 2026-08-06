// mrs/mcp/tool-registry.js

import { healthTool } from './tools/health.js';
import { readyTool } from './tools/ready.js';
import { versionTool } from './tools/version.js';
import { rt4dRenderTool } from './tools/render.js';
import { directorDepTool } from './tools/director-dep.js';
import { smeDispatchTool } from './tools/sme-dispatch.js';
import { sovereignxRouteTool, sovereignxStatsTool, sovereignxHipDetectTool } from './tools/sovereignx-route.js';

export class MCPToolRegistry {
  constructor() {
    this.tools = new Map();
    this.registerCoreTools();
  }

  registerCoreTools() {
    this.register(healthTool);
    this.register(readyTool);
    this.register(versionTool);
    this.register(rt4dRenderTool);
    this.register(directorDepTool);
    this.register(smeDispatchTool);
    this.register(sovereignxRouteTool);
    this.register(sovereignxStatsTool);
    this.register(sovereignxHipDetectTool);
  }

  register(toolDef) {
    if (!toolDef.id || typeof toolDef.execute !== 'function') {
      throw new Error('InvalidToolDefinition');
    }
    this.tools.set(toolDef.id, toolDef);
  }

  getTool(id) {
    return this.tools.get(id);
  }
}