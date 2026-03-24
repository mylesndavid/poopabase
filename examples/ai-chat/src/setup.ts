/**
 * Setup script — creates the poopabase database with chat tables + doc search.
 *
 * This dogfoods poopabase as a real database:
 * - Regular SQL tables (conversations, messages) — like Neon/Supabase
 * - Document search (FTS5) — the agent feature
 * - Memory system — the agent remembers context across conversations
 */

import { createClient } from "@libsql/client";

const DB_PATH = "./chat.poop.db";

async function setup() {
  const db = createClient({ url: `file:${DB_PATH}` });

  console.log("💩 Setting up poopabase AI chat database...\n");

  // ============================
  // Regular SQL tables (like any normal database)
  // ============================

  await db.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER REFERENCES conversations(id),
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)`
  );

  console.log("  ✓ Created tables: conversations, messages");

  // ============================
  // Document storage + FTS5 search (poopabase agent feature)
  // ============================

  await db.execute(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      title TEXT,
      type TEXT DEFAULT 'markdown',
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      section TEXT,
      chunk_index INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // FTS5 full-text search index on chunks
  await db.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      content=chunks,
      content_rowid=id,
      tokenize='porter unicode61'
    )
  `);

  // Triggers to keep FTS in sync
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
    END
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END
  `);

  console.log("  ✓ Created tables: documents, chunks, chunks_fts (FTS5)");

  // ============================
  // Memory system (poopabase agent feature)
  // ============================

  await db.execute(`
    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      source TEXT DEFAULT 'chat',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
      content,
      content=observations,
      content_rowid=id,
      tokenize='porter unicode61'
    )
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS obs_ai AFTER INSERT ON observations BEGIN
      INSERT INTO observations_fts(rowid, content) VALUES (new.id, new.content);
    END
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'memory',
      importance REAL DEFAULT 0.5,
      created_at TEXT DEFAULT (datetime('now')),
      access_count INTEGER DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      content=memories,
      content_rowid=id,
      tokenize='porter unicode61'
    )
  `);

  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS mem_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
    END
  `);

  console.log("  ✓ Created tables: observations, memories + FTS5 indexes");

  // ============================
  // Seed a sample document
  // ============================

  const sampleDoc = `# poopabase Documentation

## What is poopabase?
poopabase is the database for agents. It combines SQL, document search, vector search, and agent memory in a single SQLite file.

## Quick Start
Install the CLI: npm install -g @poopabase/cli
Create a database: poop init myproject
Ingest documents: poop ingest ./docs/
Search: poop search "your query"

## Features
- Full SQL database (create tables, queries, joins)
- FTS5 full-text search with BM25 ranking
- Document ingestion and chunking
- Agent memory with auto-compaction
- MCP server for AI agent integration
- CLI-first design for agent workflows

## API
The poopabase API runs on port 3141 by default.
POST /search — hybrid document search
POST /query — execute SQL
POST /docs/ingest — ingest a document
POST /memory/observe — store an observation
POST /memory/recall — recall memories`;

  const docResult = await db.execute({
    sql: "INSERT INTO documents (source, title, type, content) VALUES (?, ?, ?, ?)",
    args: ["poopabase-docs", "poopabase Documentation", "markdown", sampleDoc],
  });

  const docId = Number(docResult.lastInsertRowid);

  // Chunk the document
  const sections = sampleDoc.split(/(?=^## )/m);
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;
    const heading = section.match(/^##?\s+(.+)/)?.[1] || null;
    await db.execute({
      sql: "INSERT INTO chunks (document_id, content, section, chunk_index) VALUES (?, ?, ?, ?)",
      args: [docId, section, heading, i],
    });
  }

  console.log("  ✓ Seeded sample document with", sections.length, "chunks");

  // Verify FTS works
  const searchResult = await db.execute({
    sql: "SELECT c.content, c.section FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid WHERE chunks_fts MATCH 'search' LIMIT 3",
    args: [],
  });
  console.log("  ✓ FTS5 verified:", searchResult.rows.length, "results for 'search'");

  console.log("\n💩 Database ready: " + DB_PATH);
  console.log("   Tables: conversations, messages, documents, chunks, observations, memories");
  console.log("   FTS5 indexes: chunks_fts, observations_fts, memories_fts");
  console.log("\n   Start the server: npm run dev");
  console.log("   Open in poopabase: poop studio --db " + DB_PATH);
  console.log("   Connect via Neon-style URL: http://localhost:3141");

  db.close();
}

setup().catch(console.error);
