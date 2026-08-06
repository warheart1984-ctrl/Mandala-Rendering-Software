import http from 'http';
import { MCPToolRegistry } from './mcp/tool-registry.js';
import { GovernanceAdapter } from './mcp/governance-adapter.js';
import { ConformanceAdapter } from './mcp/conformance-adapter.js';

const PORT = 8080;

const toolRegistry = new MCPToolRegistry();
const governance = new GovernanceAdapter();
const conformance = new ConformanceAdapter();

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({error: 'Method Not Allowed'}));
  }
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);
      const { toolId, params, context } = payload;
      
      const governanceResult = await governance.evaluate({ toolId, params, context });
      console.log('governance:', governanceResult);
      
      const conformanceResult = await conformance.evaluate({ toolId, params, context });
      console.log('conformance:', conformanceResult);
      
      const tool = toolRegistry.getTool(toolId);
      if (!tool) {
        res.writeHead(404, {'Content-Type': 'application/json'});
        return res.end(JSON.stringify({error: 'ToolNotFound', toolId}));
      }
      
      const result = await tool.execute(params, context);
      
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({toolId, result}));
    } catch (err) {
      console.error('Error:', err);
      res.writeHead(500, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'InternalError', message: err.message}));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => console.log('listening on 8080'));
process.stdin.resume();