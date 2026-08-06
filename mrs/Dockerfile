# mrs/Dockerfile

FROM node:22-alpine AS base

WORKDIR /usr/src/mrs

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Expose MCP port
ENV MRS_MCP_PORT=8080
EXPOSE 8080

# Default command: start MCP server
CMD ["node", "mcp/server.js"]