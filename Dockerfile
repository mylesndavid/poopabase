FROM node:22-alpine

WORKDIR /app

# Install poopabase packages
COPY packages/cli/package.json packages/cli/
COPY packages/mcp/package.json packages/mcp/
COPY packages/cli/src packages/cli/src/
COPY packages/cli/tsconfig.json packages/cli/
COPY packages/mcp/src packages/mcp/src/
COPY packages/mcp/tsconfig.json packages/mcp/

# Install dependencies
RUN cd packages/cli && npm install
RUN cd packages/mcp && npm install

# Copy dashboard
COPY packages/dashboard/ packages/dashboard/
RUN cd packages/dashboard && npm install && npm run build 2>/dev/null || true

# Create data directory for databases
RUN mkdir -p /data

# Create a default poopabase database
RUN cd packages/cli && npx tsx src/index.ts init default --db /data/default.poop.db 2>/dev/null || true

# Expose ports
# 3141 = API server (Hrana + REST)
# 3008 = Dashboard (Next.js)
EXPOSE 3141 3008

# Start both the API server and dashboard
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]
