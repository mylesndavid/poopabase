# 💩 poopabase

The database for agents.

SQL. Documents. Vectors. Memory. One file. Built on [libSQL](https://github.com/tursodatabase/libsql).

## Features

- **Full database** — Create tables, browse data, edit schemas. Powered by [Outerbase Studio](https://github.com/outerbase/studio).
- **Document search** — Ingest markdown, PDFs, code. Hybrid BM25 + vector search with RRF fusion.
- **Agent memory** — Observations auto-compact into durable memories. Agents remember across sessions.
- **MCP server** — `poop serve --mcp` exposes your database as tools for Claude Code, Cursor, and any MCP client.
- **CLI-first** — Agents work best with CLIs. `poop search`, `poop observe`, `poop recall`.
- **Serverless** — SQLite-based. One file. No connection pooling. No server to manage.

## Quick Start

```bash
# Install
npm install -g @poopabase/cli

# Create a database
poop init myproject

# Ingest documents
poop ingest ./docs/

# Search
poop search "how does authentication work"

# Agent memory
poop observe "user prefers TypeScript over JavaScript"
poop recall "user preferences"

# Open the studio (full database UI)
poop studio

# Start API server
poop serve

# Start MCP server for AI agents
poop serve --mcp
```

## Architecture

```
poopabase/
├── packages/
│   ├── core/        — @poopabase/core (TypeScript library)
│   ├── cli/         — @poopabase/cli (the `poop` command)
│   ├── dashboard/   — Web UI (forked from Outerbase Studio)
│   └── mcp/         — MCP server for AI agents
```

## The `poop` CLI

| Command | Description |
|---------|-------------|
| `poop init [name]` | Create a new database |
| `poop ingest <path>` | Ingest documents (file, directory) |
| `poop search <query>` | Hybrid search across documents |
| `poop observe <text>` | Store an observation |
| `poop recall <query>` | Recall relevant memories |
| `poop compact` | Compact observations into memories |
| `poop shell` | Interactive SQL shell |
| `poop studio` | Open Outerbase Studio UI |
| `poop serve` | Start HTTP API server |
| `poop status` | Database stats |

## Search Modes

poopabase combines multiple search strategies:

- **Keyword (BM25)** — SQLite FTS5 full-text search. Great for exact terms.
- **Semantic (Vector)** — Embedding similarity search. Understands meaning.
- **Hybrid** — Both combined with Reciprocal Rank Fusion. Best of both worlds.

## Agent Memory

Inspired by how humans remember:

1. **Observe** — Store raw observations (facts, preferences, context)
2. **Compact** — Similar observations automatically merge into durable memories
3. **Recall** — Search memories by relevance. Most-accessed memories surface first.

## MCP Integration

poopabase exposes 7 MCP tools:

| Tool | Description |
|------|-------------|
| `poopabase_search` | Hybrid document search |
| `poopabase_query` | Execute SQL |
| `poopabase_ingest` | Add documents |
| `poopabase_recall` | Recall memories |
| `poopabase_observe` | Store observations |
| `poopabase_compact` | Compact memories |
| `poopabase_status` | Database stats |

## Tech Stack

- [libSQL](https://github.com/tursodatabase/libsql) — SQLite fork with vector search
- [FTS5](https://www.sqlite.org/fts5.html) — Full-text search with BM25 ranking
- [Outerbase Studio](https://github.com/outerbase/studio) — Database management UI
- [MCP](https://modelcontextprotocol.io/) — Model Context Protocol for AI agents

## License

AGPL-3.0 (dashboard), MIT (core, cli, mcp)
