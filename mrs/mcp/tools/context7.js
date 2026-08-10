// mrs/mcp/tools/context7.js
// Context7 Integration for MRS MCP Server
//
// Context7 is an external MCP server that provides up-to-date library documentation.
// It runs at https://mcp.context7.com/mcp and provides these MCP tools:
//   - resolve-library-id: Resolves a library name to a Context7 library ID
//   - query-docs: Retrieves documentation for a library ID
//
// To use Context7 with this project, configure your AI client (opencode, Cursor, etc.)
// to connect to BOTH MCP servers:
//   1. MRS MCP Server: http://localhost:8080 (this server)
//   2. Context7 MCP Server: https://mcp.context7.com/mcp
//
// For opencode, add to ~/.config/opencode/config.json or .opencode/config.json:
// {
//   "mcp": {
//     "servers": {
//       "mrs": { "url": "http://localhost:8080" },
//       "context7": { "url": "https://mcp.context7.com/mcp" }
//     }
//   }
// }
//
// For local development, you can also run Context7 locally:
//   npx @upstash/context7-mcp
// Then use: http://localhost:3001/mcp (default port)

export const context7Info = {
  name: 'Context7 Documentation',
  description: 'Up-to-date library documentation via Context7 MCP server',
  mcpServerUrl: 'https://mcp.context7.com/mcp',
  localMcpCommand: 'npx @upstash/context7-mcp',
  localMcpPort: 3001,
  tools: [
    {
      name: 'resolve-library-id',
      description: 'Resolves a general library name into a Context7-compatible library ID',
      parameters: {
        query: 'The user\'s question or task (used to rank results by relevance)',
        libraryName: 'The name of the library to search for',
      },
    },
    {
      name: 'query-docs',
      description: 'Retrieves documentation for a library using a Context7-compatible library ID',
      parameters: {
        libraryId: 'Exact Context7-compatible library ID (e.g., "/vercel/next.js")',
        query: 'The question or task to get relevant documentation for',
      },
    },
  ],
  setupInstructions: `
# Context7 Setup for MRS Project

## Option 1: Use Context7 Cloud MCP Server (Recommended)

Configure your AI client to connect to both MCP servers:

### opencode
Add to ~/.config/opencode/config.json:
{
  "mcp": {
    "servers": {
      "mrs": { "url": "http://localhost:8080" },
      "context7": { "url": "https://mcp.context7.com/mcp" }
    }
  }
}

### Cursor
Add to Cursor Settings > MCP:
- Name: context7, URL: https://mcp.context7.com/mcp

### Claude Code
Add to CLAUDE.md or use: claude mcp add context7 https://mcp.context7.com/mcp

## Option 2: Run Context7 Locally

Run the Context7 MCP server locally:
  npx @upstash/context7-mcp

Then configure your client to use: http://localhost:3001/mcp

## Usage

Once configured, you can use Context7 tools directly in your prompts:

"Create a Next.js middleware that checks for a valid JWT in cookies and redirects unauthenticated users to /login. use context7"

"Show me the AWS SDK v3 DynamoDB putItem API. use library /aws/aws-sdk-js-v3"

The AI client will automatically call the Context7 MCP tools to fetch up-to-date documentation.
  `,
};