FROM node:22-alpine

WORKDIR /app

# Install poopabase CLI
COPY packages/cli/package.json packages/cli/
COPY packages/cli/src packages/cli/src/
COPY packages/cli/tsconfig.json packages/cli/
RUN cd packages/cli && npm install

# Install poopabase MCP
COPY packages/mcp/package.json packages/mcp/
COPY packages/mcp/src packages/mcp/src/
COPY packages/mcp/tsconfig.json packages/mcp/
RUN cd packages/mcp && npm install

# Build dashboard
COPY packages/dashboard/ packages/dashboard/
RUN cd packages/dashboard && npm install && npm run build

# Create data directory
RUN mkdir -p /data

EXPOSE 3141 3008

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]
