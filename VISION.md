# poopabase

**The database for agents.**

SQL. Documents. Vectors. Memory. Hybrid search. One file. Hibernates to S3 when you're not looking. Built on libSQL. MCP-native. Stupid cheap.

```
The agent stack:
  LLM (Claude, GPT, etc.)     ← the brain
  Agent framework (OpenClaw)    ← the body
  poopabase                     ← the memory + knowledge
```

---

## The Pitch

Most side projects, MVPs, and indie apps don't need a database running 24/7. They get bursts of traffic, then nothing for hours. But you're still paying Supabase $25/month or RDS $15/month for a server that's idle 90% of the time.

**PupaBase hibernates your database to S3 ($0.023/GB/month) when it's not being queried, and wakes it up into memory when a request comes in.** Your $25/month database bill becomes $0.05/month.

---

## How It Works

```
Request comes in
    ↓
Is the DB in memory? ──YES──→ Query it (< 1ms)
    │
    NO
    ↓
Pull from S3 (cold start ~200-500ms for small DBs)
    ↓
Load into memory / local SSD
    ↓
Query it
    ↓
Keep warm for N minutes
    ↓
No queries for N minutes? → Hibernate back to S3
```

### The Technical Stack

- **libSQL** (Turso's open-source SQLite fork) — the database engine
  - Full SQLite compatibility
  - Native vector search (F32_BLOB + DiskANN indexes)
  - WAL mode for concurrent reads
  - Built-in replication

- **S3-compatible storage** — hibernation layer
  - Databases serialize to a single file
  - Versioned snapshots (point-in-time recovery for free)
  - R2/MinIO/S3 — user picks their storage

- **Edge runtime** — the serving layer
  - Fly.io machines (scale to zero)
  - OR Cloudflare Workers + D1 bridge
  - OR bare metal with a thin orchestrator

- **Hrana protocol** — the wire protocol
  - Same protocol Turso uses
  - Existing `@libsql/client` SDKs work out of the box
  - Drop-in replacement for Turso

---

## Why Someone Would Use PupaBase

### 1. It's Genuinely Cheaper
| Scenario | Supabase | PlanetScale | PupaBase |
|----------|----------|-------------|----------|
| Side project (10K queries/month) | $25/mo | $29/mo | ~$0.10/mo |
| MVP (100K queries/month) | $25/mo | $29/mo | ~$1/mo |
| Indie SaaS (1M queries/month) | $25/mo | $29/mo | ~$5/mo |

### 2. It's SQLite (Not Postgres)
- No connection pooling nightmares
- No PgBouncer
- No "too many connections" errors on serverless
- Reads are instant (local file, no network hop with embedded replicas)
- Your entire database is one file you can download, inspect, backup

### 3. Vector Search Built In
- `F32_BLOB(384)` column type
- `vector_top_k()` for nearest-neighbor search
- Build AI apps without Pinecone/Qdrant/pgvector
- Same DB for your data AND your embeddings

### 4. AI-Powered Setup
```bash
npx pupabase init
# "What are you building?" → "A recipe app"
# → Generates schema, seeds sample data, gives you a connection string
# → Dashboard opens in browser
```

### 5. Great CLI
```bash
pupa init                    # Create a new database
pupa push ./local.db         # Upload a SQLite file
pupa pull                    # Download your DB locally
pupa shell                   # Interactive SQL shell
pupa hibernate               # Force hibernate to S3
pupa wake                    # Force wake from S3
pupa branch                  # Create a branch (like Neon/PlanetScale)
pupa migrate                 # Run migrations
pupa studio                  # Open Drizzle Studio in browser
pupa status                  # Show DB stats, storage, wake/sleep history
```

### 6. Drizzle Studio Dashboard
- Browse/edit data visually
- Run queries
- See schema
- Monitor wake/sleep cycles
- Storage usage and cost estimate
- All built on Drizzle Studio (open source, already supports SQLite)

### 7. Serverless-Native
- No cold start for warm DBs (they're literally a local file)
- Works on Vercel, Cloudflare, Fly, Deno Deploy — everywhere
- Same `@libsql/client` SDK as Turso

### 8. Document Storage with PageRank Search (THE KILLER FEATURE)

Traditional RAG is dumb — it finds chunks that are vaguely similar to your query. poopabase uses **PageRank** to find chunks that are both relevant AND authoritative.

**How it works:**

```
Throw in documents (markdown, PDFs, URLs, code)
    ↓
poopabase chunks them automatically
    ↓
Each chunk gets:
  - Embedded (vector) for similarity search
  - Linked (graph) by parsing references, citations,
    headers, imports, markdown links, shared concepts
    ↓
PageRank runs on the link graph → authority scores
    ↓
Search score = (vector similarity × PageRank authority)
    ↓
You get the BEST answer, not just a similar one
```

**Why this is different:**

When an agent searches "how does authentication work":
- **Normal RAG**: Returns a random chunk that mentions "auth"
- **poopabase**: Returns the main auth documentation, because every other doc references it. That's PageRank.

**Developer experience:**

```typescript
import { Poopabase } from '@poopabase/client'

const db = new Poopabase('my-project')

// Ingest — poopabase handles chunking, embedding, graph building
await db.docs.ingest('./docs/')                    // markdown folder
await db.docs.ingest('./README.md')                // single file
await db.docs.ingest('https://docs.stripe.com')    // crawl a URL
await db.docs.upload(pdfBuffer, 'quarterly.pdf')   // PDF buffer

// Search — hybrid vector + PageRank scoring
const results = await db.docs.search('how to handle webhooks')
// → Returns the most authoritative AND relevant chunks

// Agent-friendly — pre-formatted context with citations
const context = await db.docs.context('how to handle webhooks', {
  maxTokens: 4000
})
// → Ready to paste into an LLM prompt

// Filter by document type, tags, recency
const results = await db.docs.search('auth', {
  type: 'markdown',
  tags: ['api'],
  after: '2025-01-01'
})
```

**Under the hood (all in SQLite):**

```sql
-- Documents table
CREATE TABLE docs (
  id INTEGER PRIMARY KEY,
  source TEXT,           -- file path, URL, etc.
  type TEXT,             -- markdown, pdf, url, code
  content TEXT,          -- raw content
  metadata JSON,         -- title, tags, dates, etc.
  ingested_at TEXT
);

-- Chunks table
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  doc_id INTEGER REFERENCES docs(id),
  content TEXT,           -- chunk text
  embedding F32_BLOB(384), -- vector embedding
  pagerank REAL DEFAULT 0, -- PageRank authority score
  metadata JSON            -- position, heading, section
);

-- Link graph (for PageRank)
CREATE TABLE chunk_links (
  source_id INTEGER REFERENCES chunks(id),
  target_id INTEGER REFERENCES chunks(id),
  link_type TEXT,  -- 'reference', 'citation', 'heading', 'import', 'concept'
  weight REAL DEFAULT 1.0
);

-- Vector index
CREATE INDEX chunks_vec_idx ON chunks(libsql_vector_idx(embedding));

-- Search: vector similarity × PageRank
-- This is the magic query
SELECT c.content, c.pagerank, d.source,
       vector_distance(c.embedding, vector(?)) as similarity,
       (1.0 / (1.0 + vector_distance(c.embedding, vector(?)))) * c.pagerank as score
FROM vector_top_k('chunks_vec_idx', vector(?), 100) v
JOIN chunks c ON c.rowid = v.id
JOIN docs d ON d.id = c.doc_id
ORDER BY score DESC
LIMIT 10;
```

### 9. MCP Server (Agentic Search)

Every AI tool supports MCP now — Claude Code, Cursor, Windsurf, OpenClaw. poopabase becomes a native tool for any agent:

```bash
poop serve --mcp  # Starts an MCP server on your poopabase

# Now in Claude Code:
# "Search my docs for authentication flow"
# → Agent calls poopabase MCP → gets PageRanked results → answers correctly
```

**MCP Tools exposed:**

```json
{
  "tools": [
    {
      "name": "poopabase_search",
      "description": "Search documents with hybrid vector + PageRank scoring",
      "parameters": { "query": "string", "limit": "number", "filter": "object" }
    },
    {
      "name": "poopabase_query",
      "description": "Run a SQL query on the database",
      "parameters": { "sql": "string", "args": "array" }
    },
    {
      "name": "poopabase_ingest",
      "description": "Add a document to the knowledge base",
      "parameters": { "content": "string", "source": "string", "type": "string" }
    }
  ]
}
```

This means any agent can read AND write to poopabase. Your AI assistant can search your docs, query your data, and even add new documents — all through a standardized protocol.

### 10. Four Modes, One Database

| Mode | What | Use Case |
|------|------|----------|
| **SQL** | Relational tables | App data, users, products |
| **Document** | JSON columns + `->>`  operators | Flexible schemas, config, profiles |
| **Vector** | `F32_BLOB` + `vector_top_k()` | Similarity search, recommendations |
| **Docs** | Markdown/PDF/URL + PageRank | Knowledge base, AI context, agentic search |

No other database does all four. Certainly not for $0.10/month.

---

## Differentiators vs. Competitors

| Feature | poopabase | Turso | Supabase | Firebase | Pinecone |
|---------|-----------|-------|----------|----------|----------|
| Hibernate to S3 | Yes | No | No | No | No |
| Cost at idle | ~$0 | Free tier | $25/mo | Free tier | $0 (starter) |
| SQL | Yes | Yes | Yes | No | No |
| Document (JSON) | Yes | Yes | Yes | Yes | No |
| Vector search | Yes | Yes | pgvector | No | Yes |
| **PageRank docs** | **Yes** | **No** | **No** | **No** | **No** |
| **MCP server** | **Yes** | **No** | **No** | **No** | **No** |
| **Doc ingestion** | **Yes** | **No** | **No** | **No** | **No** |
| SQLite compatible | Yes | Yes | No | No | No |
| One-file backup | Yes | Yes | No | No | No |
| AI schema setup | Yes | No | No | No | No |
| Branch databases | Yes | No | No | No | No |

---

## Revenue Model

1. **Free tier** — 3 databases, 1GB S3 storage, unlimited hibernation
2. **Pro ($9/mo)** — 25 databases, 10GB storage, faster wake times, custom domains
3. **Team ($29/mo)** — unlimited databases, 100GB storage, team access, audit log
4. **S3 passthrough** — users can bring their own S3/R2 bucket (we charge for compute only)

---

## MVP Scope

### Phase 1 — Core (Week 1-2)
- [ ] CLI: `poop init`, `poop push`, `poop pull`, `poop shell`, `poop studio`
- [ ] S3 hibernate/wake lifecycle
- [ ] HTTP API (Hrana-compatible) for queries
- [ ] Single-region deployment on Fly.io
- [ ] Landing page (poopabase.com)

### Phase 2 — Docs + PageRank (Week 2-3)
- [ ] `poop ingest ./docs/` — markdown + PDF chunking
- [ ] Embedding pipeline (all-MiniLM-L6-v2 or user-configurable)
- [ ] Link graph extraction (references, headings, imports, shared concepts)
- [ ] PageRank computation on chunk graph
- [ ] Hybrid search: `db.docs.search()` with vector × PageRank scoring
- [ ] `db.docs.context()` for LLM-ready output with citations

### Phase 3 — MCP + Agentic (Week 3-4)
- [ ] `poop serve --mcp` — MCP server for AI tools
- [ ] Tools: search, query, ingest
- [ ] Claude Code / Cursor / Windsurf integration examples
- [ ] Auto-reindex on document changes

### Phase 4 — Dashboard + DX (Week 4-5)
- [ ] Drizzle Studio integration
- [ ] Auth (GitHub OAuth)
- [ ] `npx poopabase init` with AI schema generation
- [ ] JS/TS SDK (`@poopabase/client`)
- [ ] Python SDK
- [ ] Docs site

### Phase 5 — Scale (Later)
- [ ] Multi-region replicas
- [ ] Branch databases
- [ ] Embedded replicas SDK
- [ ] URL crawling + auto-refresh for ingested sites
- [ ] Webhooks on document changes
- [ ] Templates: "AI chatbot", "knowledge base", "RAG app"
