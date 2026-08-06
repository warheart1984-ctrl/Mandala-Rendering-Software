// mrs/mcp/server.js

import http from 'http';
import { MCPToolRegistry } from './tool-registry.js';
import { GovernanceAdapter } from './governance-adapter.js';
import { ConformanceAdapter } from './conformance-adapter.js';
import { authService } from './services/AuthService.js';
import { authMiddleware, optionalAuth } from './middleware/auth.js';
import { idempotencyMiddleware } from './middleware/idempotency.js';
import { planRateLimitMiddleware } from './middleware/rateLimit.js';
import { correlationMiddleware } from './middleware/correlation.js';
import { validateBody } from './middleware/validation.js';
import { CreateSceneSchema, SubmitRenderSchema, DEPExecuteSchema, SMEDispatchSchema, SovereignXRouteSchema, SovereignXHipDetectSchema } from './shared/schemas.js';

const PORT = process.env.MRS_MCP_PORT || 8080;
const REST_PORT = process.env.MRS_REST_PORT || 8081;

// --- Middleware chain for protected routes ---
function createProtectedHandler(handler, options = {}) {
  const { requireAuth = true, requireIdempotency = true, rateLimit = true, validationSchema = null } = options;
  
  return async (req, res) => {
    try {
      // Correlation ID
      await runMiddleware(req, res, correlationMiddleware);
      if (res.writableEnded) return;
      
      // Rate limiting
      if (rateLimit) {
        await runMiddleware(req, res, planRateLimitMiddleware);
        if (res.writableEnded) return;
      }
      
      // Authentication
      if (requireAuth) {
        await runMiddleware(req, res, authMiddleware);
        if (res.writableEnded) return;
      } else {
        await runMiddleware(req, res, optionalAuth);
        if (res.writableEnded) return;
      }
      
      // Idempotency
      if (requireIdempotency) {
        await runMiddleware(req, res, idempotencyMiddleware);
        if (res.writableEnded) return;
      }
      
      // Validation
      if (validationSchema) {
        await runMiddleware(req, res, validateBody(validationSchema));
        if (res.writableEnded) return;
      }
      
      // Call actual handler
      await handler(req, res);
    } catch (err) {
      console.error('Handler error:', err);
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'InternalError', message: err.message }));
      }
    }
  };
}

// Helper to run Express-style middleware as promise
function runMiddleware(req, res, middleware) {
  return new Promise((resolve) => {
    middleware(req, res, () => resolve());
  });
}
// Helper to read request body
async function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
  });
}

function createRestRouter(kernel) {
  const routes = {
    'GET /health': createProtectedHandler(async (req, res) => {
      const tool = kernel.toolRegistry.getTool('mrs.health');
      const result = await tool.execute({}, {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...result }));
    }, { requireAuth: false, rateLimit: false }),
    
    'GET /ready': createProtectedHandler(async (req, res) => {
      const tool = kernel.toolRegistry.getTool('mrs.ready');
      const result = await tool.execute({}, { dependencies: { mcpServer: 'ready', governance: 'ready', conformance: 'ready' } });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...result }));
    }, { requireAuth: false, rateLimit: false }),
    
    'GET /version': createProtectedHandler(async (req, res) => {
      const tool = kernel.toolRegistry.getTool('mrs.version');
      const result = await tool.execute({}, {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...result }));
    }, { requireAuth: false, rateLimit: false }),
    
    'POST /render': createProtectedHandler(async (req, res) => {
      try {
        const payload = req.validatedBody || JSON.parse(await readBody(req));
        const { toolId, params, context } = { toolId: 'mrs.render.rt4d', params: payload, context: payload.context || {} };
        context.actorIdentity = req.auth ? { id: req.auth.userId, type: req.auth.scopes.includes('admin') ? 'director' : 'user' } : { id: 'anonymous', type: 'user' };
        context.correlationId = req.correlationId;
        
        const governanceResult = await kernel.governance.evaluate({ toolId, params, context });
        if (!governanceResult.allowed) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'GovernanceDenied', details: governanceResult.reason }));
        }
        
        const conformanceResult = await kernel.conformance.evaluate({ toolId, params, context });
        if (!conformanceResult.passed) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'ConformanceFailed', details: conformanceResult.details }));
        }
        
        const tool = kernel.toolRegistry.getTool(toolId);
        const result = await tool.execute(params, context);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, toolId, result }));
      } catch (err) {
        console.error('REST render error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'InternalError', message: err.message }));
      }
    }, { validationSchema: SubmitRenderSchema }),
    
    'POST /api/v1/dep/execute': createProtectedHandler(async (req, res) => {
      try {
        const payload = req.validatedBody;
        const { toolId, params, context } = { toolId: 'mrs.director.dep', params: payload, context: payload.context || {} };
        context.actorIdentity = req.auth ? { id: req.auth.userId, type: 'director' } : { id: 'anonymous', type: 'user' };
        context.correlationId = req.correlationId;
        
        const governanceResult = await kernel.governance.evaluate({ toolId, params, context });
        if (!governanceResult.allowed) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'GovernanceDenied', details: governanceResult.reason }));
        }
        
        const conformanceResult = await kernel.conformance.evaluate({ toolId, params, context });
        if (!conformanceResult.passed) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'ConformanceFailed', details: conformanceResult.details }));
        }
        
        const tool = kernel.toolRegistry.getTool(toolId);
        const result = await tool.execute(params, context);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, toolId, result }));
      } catch (err) {
        console.error('REST DEP execute error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'InternalError', message: err.message }));
      }
    }, { validationSchema: DEPExecuteSchema }),
    
    'POST /api/v1/sme/dispatch': createProtectedHandler(async (req, res) => {
      try {
        const payload = req.validatedBody;
        const { toolId, params, context } = { toolId: 'mrs.sme.dispatch', params: payload, context: payload.context || {} };
        context.actorIdentity = req.auth ? { id: req.auth.userId, type: 'director' } : { id: 'anonymous', type: 'user' };
        context.correlationId = req.correlationId;
        
        const governanceResult = await kernel.governance.evaluate({ toolId, params, context });
        if (!governanceResult.allowed) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'GovernanceDenied', details: governanceResult.reason }));
        }
        
        const conformanceResult = await kernel.conformance.evaluate({ toolId, params, context });
        if (!conformanceResult.passed) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'ConformanceFailed', details: conformanceResult.details }));
        }
        
        const tool = kernel.toolRegistry.getTool(toolId);
        const result = await tool.execute(params, context);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, toolId, result }));
      } catch (err) {
        console.error('REST SME dispatch error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'InternalError', message: err.message }));
      }
    }, { validationSchema: SMEDispatchSchema }),
    
    'POST /api/v1/sovereignx/route': createProtectedHandler(async (req, res) => {
      try {
        const payload = req.validatedBody;
        console.log('>>> SX ROUTE HIT <<<');
        console.log('[SX ROUTE] validatedBody keys:', Object.keys(payload));
        console.log('[SX ROUTE] payload.context:', payload.context);
        const { toolId, params, context } = { toolId: 'mrs.sovereignx.route', params: payload, context: payload.context || {} };
        console.log('[SX ROUTE] context keys:', Object.keys(context));
        console.log('[SX ROUTE] context.lattice:', context.lattice);
        context.actorIdentity = req.auth ? { id: req.auth.userId, type: 'sovereignx' } : { id: 'anonymous', type: 'user' };
        context.correlationId = req.correlationId;
        
        const governanceResult = await kernel.governance.evaluate({ toolId, params, context });
        if (!governanceResult.allowed) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'GovernanceDenied', details: governanceResult.reason }));
        }
        
        const conformanceResult = await kernel.conformance.evaluate({ toolId, params, context });
        if (!conformanceResult.passed) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'ConformanceFailed', details: conformanceResult.details }));
        }
        
        const tool = kernel.toolRegistry.getTool(toolId);
        const result = await tool.execute(params, context);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, toolId, result }));
      } catch (err) {
        console.error('REST SovereignX route error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'InternalError', message: err.message }));
      }
    }, { validationSchema: SovereignXRouteSchema }),
    
    'GET /api/v1/sovereignx/stats': createProtectedHandler(async (req, res) => {
      try {
        const { toolId, params, context } = { toolId: 'mrs.sovereignx.stats', params: {}, context: {} };
        context.actorIdentity = req.auth ? { id: req.auth.userId, type: 'sovereignx' } : { id: 'anonymous', type: 'user' };
        context.correlationId = req.correlationId;
        
        const governanceResult = await kernel.governance.evaluate({ toolId, params, context });
        if (!governanceResult.allowed) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'GovernanceDenied', details: governanceResult.reason }));
        }
        
        const conformanceResult = await kernel.conformance.evaluate({ toolId, params, context });
        if (!conformanceResult.passed) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'ConformanceFailed', details: conformanceResult.details }));
        }
        
        const tool = kernel.toolRegistry.getTool(toolId);
        const result = await tool.execute(params, context);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, toolId, result }));
      } catch (err) {
        console.error('REST SovereignX stats error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'InternalError', message: err.message }));
      }
    }, { requireIdempotency: false }),
    
    'POST /api/v1/sovereignx/hip/detect': createProtectedHandler(async (req, res) => {
      try {
        const payload = req.validatedBody || {};
        const { toolId, params, context } = { toolId: 'mrs.sovereignx.hip.detect', params: payload, context: payload.context || {} };
        context.actorIdentity = req.auth ? { id: req.auth.userId, type: 'sovereignx' } : { id: 'anonymous', type: 'user' };
        context.correlationId = req.correlationId;
        
        const governanceResult = await kernel.governance.evaluate({ toolId, params, context });
        if (!governanceResult.allowed) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'GovernanceDenied', details: governanceResult.reason }));
        }
        
        const conformanceResult = await kernel.conformance.evaluate({ toolId, params, context });
        if (!conformanceResult.passed) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'ConformanceFailed', details: conformanceResult.details }));
        }
        
        const tool = kernel.toolRegistry.getTool(toolId);
        const result = await tool.execute(params, context);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, toolId, result }));
      } catch (err) {
        console.error('REST SovereignX HIP detect error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'InternalError', message: err.message }));
      }
    }, { validationSchema: SovereignXHipDetectSchema, requireIdempotency: false }),
  };

  return async (req, res) => {
    const key = `${req.method} ${req.url}`;
    const handler = routes[key];
    
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not Found', path: req.url }));
    }
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    
    await handler(req, res);
  };
}

// --- OpenAPI Spec ---
function generateOpenAPISpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Mandala Rendering System API',
      version: '0.1.0',
      description: 'Constitutional 4D Rendering & Governance API. MCP server on port 8080, REST API on port 8081.',
    },
    servers: [
      { url: `http://localhost:8081`, description: 'Local REST API' },
      { url: `http://localhost:8080`, description: 'MCP JSON-RPC endpoint' },
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          responses: { '200': { description: 'OK' } },
        },
      },
      '/ready': {
        get: {
          summary: 'Readiness check',
          responses: { '200': { description: 'OK' } },
        },
      },
      '/version': {
        get: {
          summary: 'Version info',
          responses: { '200': { description: 'OK' } },
        },
      },
      '/render': {
        post: {
          summary: 'Render a 4D scene',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'Render result' } },
        },
      },
      '/api/v1/dep/execute': {
        post: {
          summary: 'Execute Director DEP workflow (Plan → Route → Supervise → Enforce Governance)',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'DEP execution result' }, '403': { description: 'Governance denied' }, '422': { description: 'Conformance failed' } },
        },
      },
      '/api/v1/sme/dispatch': {
        post: {
          summary: 'Dispatch tasks to SME modules',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'SME dispatch result' }, '403': { description: 'Governance denied' }, '422': { description: 'Conformance failed' } },
        },
      },
      '/api/v1/sovereignx/route': {
        post: {
          summary: 'Route render task via Sovereign X Constitutional Compute Scheduler',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'Routing result with efficiency metrics' }, '403': { description: 'Governance denied' }, '422': { description: 'Conformance failed' } },
        },
      },
      '/api/v1/sovereignx/stats': {
        get: {
          summary: 'Get Sovereign X router statistics and efficiency metrics',
          responses: { '200': { description: 'Router statistics' }, '403': { description: 'Governance denied' } },
        },
      },
      '/api/v1/sovereignx/hip/detect': {
        post: {
          summary: 'Detect HIP/ROCm SDK availability',
          requestBody: {
            required: false,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'HIP SDK status' }, '403': { description: 'Governance denied' } },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
    },
  };
}

export class MCPServerKernel {
  constructor({ toolRegistry, governance, conformance }) {
    this.toolRegistry = toolRegistry;
    this.governance = governance;
    this.conformance = conformance;
  }

  async handleRequest(req, res) {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);

        const { toolId, params, context } = payload;

        // 1. Governance pre-check
        let governanceResult;
        try {
          governanceResult = await this.governance.evaluate({
            toolId,
            params,
            context,
          });
        } catch (err) {
          console.error('Governance error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'GovernanceError', message: err.message }));
        }
        if (!governanceResult.allowed) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            error: 'GovernanceDenied',
            details: governanceResult.reason,
          }));
        }

        // 2. Conformance pre-check
        let conformanceResult;
        try {
          conformanceResult = await this.conformance.evaluate({
            toolId,
            params,
            context,
          });
        } catch (err) {
          console.error('Conformance error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'ConformanceError', message: err.message }));
        }
        if (!conformanceResult.passed) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            error: 'ConformanceFailed',
            details: conformanceResult.details,
          }));
        }

        // 3. Tool dispatch
        const tool = this.toolRegistry.getTool(toolId);
        if (!tool) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'ToolNotFound', toolId }));
        }

        const result = await tool.execute(params, context);

        // 4. Provenance envelope (LEPR later)
        const response = {
          toolId,
          result,
          meta: {
            governance: governanceResult.meta,
            conformance: conformanceResult.meta,
            timestamp: new Date().toISOString(),
          },
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (err) {
        console.error('handleRequest error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'InternalError',
          message: err.message,
        }));
      }
    });
  }
}

function bootstrap() {
  console.log('Bootstrap started');
  const toolRegistry = new MCPToolRegistry();
  console.log('Tool registry created');
  const governance = new GovernanceAdapter();
  console.log('Governance adapter created');
  const conformance = new ConformanceAdapter();
  console.log('Conformance adapter created');

  const kernel = new MCPServerKernel({ toolRegistry, governance, conformance });

  // --- MCP Server (port 8080) ---
  const mcpServer = http.createServer((req, res) => kernel.handleRequest(req, res));
  mcpServer.on('error', (err) => console.error('MCP Server error:', err));
  mcpServer.listen(PORT, () => {
    console.log(`MRS MCP server listening on port ${PORT}`);
  });

  // --- REST Server (port 8081) ---
  const restRouter = createRestRouter(kernel);
  const restServer = http.createServer(async (req, res) => {
    try {
      await restRouter(req, res);
    } catch (err) {
      console.error('REST error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'InternalError', message: err.message }));
    }
  });
  restServer.on('error', (err) => console.error('REST Server error:', err));
  restServer.listen(REST_PORT, () => {
    console.log(`MRS REST API listening on port ${REST_PORT}`);
    console.log(`OpenAPI spec: http://localhost:${REST_PORT}/openapi.json`);
  });

  // --- OpenAPI Spec endpoint ---
  const specServer = http.createServer((req, res) => {
    if (req.url === '/openapi.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(generateOpenAPISpec(), null, 2));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  specServer.listen(REST_PORT + 1, () => {
    console.log(`OpenAPI spec available on port ${REST_PORT + 1}/openapi.json`);
  });

  console.log('Bootstrap complete');
}

bootstrap();