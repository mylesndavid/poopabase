---
title: Sparse N-gram Pattern Search
status: planned
priority: high
inspiration: https://cursor.com/blog/fast-regex-search
---

# Sparse N-gram Pattern Search for poopabase

## The Problem
FTS5 (BM25) handles natural language queries. Vector search handles semantic similarity. But neither handles **regex/pattern matching** well — exact function names, error codes, config keys, code patterns. Agents need all three.

## The Technique (from Cursor's blog, March 2026)

### Sparse N-grams
- Unlike fixed trigrams (always 3 chars), sparse n-grams have **variable length**
- Extracted deterministically using hash-weighted character pairs
- Each document gets a set of sparse n-grams at index time
- At query time, generate minimal covering n-grams from the regex pattern
- Check the inverted index to find candidate documents
- Only scan candidates with full regex — skip everything else

### Probabilistic Masks
- 8-bit bloom filters per n-gram entry
- Encode adjacency and position information
- Further prune false positives before full scan

### Why It's Fast
- ripgrep scans EVERY file (O(n) on corpus size)
- Sparse n-gram index narrows candidates to ~1-5% of files
- Then regex only runs on those candidates
- Result: 10-100x faster on large corpora

## Implementation Plan for poopabase

### Storage (in the existing SQLite db)
```sql
CREATE TABLE poop_ngram_index (
  ngram TEXT NOT NULL,
  chunk_id INTEGER REFERENCES poop_chunks(id),
  position INTEGER,
  mask INTEGER,  -- 8-bit bloom filter
  PRIMARY KEY (ngram, chunk_id)
);
CREATE INDEX idx_ngram ON poop_ngram_index(ngram);
```

### Index Build (at ingest time)
1. For each chunk, extract sparse n-grams using hash-weighted selection
2. For each n-gram, store (ngram, chunk_id, position, mask)
3. ~50-100 n-grams per chunk (tunable)

### Query Flow
```
User regex: /handleAuth\w+Error/
    ↓
Extract n-grams from pattern: ["handleAuth", "Error"]
    ↓
Look up inverted index: chunks containing BOTH n-grams
    ↓
Check bloom masks for adjacency
    ↓
Full regex scan on ~2% of chunks
    ↓
Return matches with source citations
```

### poopabase Search Modes (final vision)
```
db.search("how does auth work")           → FTS5/BM25 (keyword)
db.search("how does auth work", "vector")  → embedding similarity
db.search("/handleAuth\w+/", "pattern")    → sparse n-gram accelerated regex
db.search("auth", "hybrid")               → all three, RRF fused
```

### CLI
```bash
poop search "auth"                  # hybrid (default)
poop search --regex "handleAuth\w+" # pattern search
poop grep "handleAuth\w+"           # alias for pattern search
```

### MCP Tool
```json
{
  "name": "poopabase_grep",
  "description": "Fast regex pattern search across all documents using sparse n-gram indexing",
  "parameters": { "pattern": "string", "limit": "number" }
}
```

## Why This Matters
No other database product offers indexed regex search over document chunks:
- Pinecone: vector only
- ChromaDB: vector only
- Weaviate: vector + BM25, no regex
- Supabase: pg_trgm is slow at scale
- Turso: FTS5 only

poopabase with sparse n-gram search = the only database where agents can do fast regex across millions of chunks. Combined with FTS5 + vector, it's the most complete search stack for agents.
