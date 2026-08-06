// mrs/mcp/tools/health.js

export const healthTool = {
  id: 'mrs.health',
  description: 'Basic health check for Mandala Rendering System MCP server.',
  async execute(params = {}, context = {}) {
    return {
      status: 'ok',
      components: {
        mcpServer: 'ok',
        governance: context.governanceStatus || 'unknown',
        conformance: context.conformanceStatus || 'unknown',
      },
    };
  },
};