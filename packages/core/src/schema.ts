import type { Client } from "@libsql/client";

const SCHEMA_STATEMENTS = [
  // Documents table
  `CREATE TABLE IF NOT EXISTS poop_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text',
    content TEXT NOT NULL,
    raw_content TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // Chunks table
  `CREATE TABLE IF NOT EXISTS poop_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    position INTEGER NOT NULL,
    section_heading TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    embedding BLOB,
    FOREIGN KEY (doc_id) REFERENCES poop_docs(id) ON DELETE CASCADE
  )`,

  // Index on chunks foreign key
  `CREATE INDEX IF NOT EXISTS idx_poop_chunks_doc_id ON poop_chunks(doc_id)`,

  // Index on chunks position for context window queries
  `CREATE INDEX IF NOT EXISTS idx_poop_chunks_position ON poop_chunks(doc_id, position)`,

  // FTS5 for chunk content (keyword/BM25 search)
  `CREATE VIRTUAL TABLE IF NOT EXISTS poop_chunks_fts USING fts5(
    content,
    content='poop_chunks',
    content_rowid='id'
  )`,

  // Triggers to keep FTS in sync with chunks
  `CREATE TRIGGER IF NOT EXISTS poop_chunks_ai AFTER INSERT ON poop_chunks BEGIN
    INSERT INTO poop_chunks_fts(rowid, content) VALUES (new.id, new.content);
  END`,

  `CREATE TRIGGER IF NOT EXISTS poop_chunks_ad AFTER DELETE ON poop_chunks BEGIN
    INSERT INTO poop_chunks_fts(poop_chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
  END`,

  `CREATE TRIGGER IF NOT EXISTS poop_chunks_au AFTER UPDATE ON poop_chunks BEGIN
    INSERT INTO poop_chunks_fts(poop_chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
    INSERT INTO poop_chunks_fts(rowid, content) VALUES (new.id, new.content);
  END`,

  // Memories table
  `CREATE TABLE IF NOT EXISTS poop_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'observation',
    content TEXT NOT NULL,
    importance REAL NOT NULL DEFAULT 0.5,
    metadata TEXT NOT NULL DEFAULT '{}',
    embedding BLOB,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
    access_count INTEGER NOT NULL DEFAULT 0,
    compacted INTEGER NOT NULL DEFAULT 0
  )`,

  // Index on memory type
  `CREATE INDEX IF NOT EXISTS idx_poop_memories_type ON poop_memories(type)`,

  // Index on compacted flag
  `CREATE INDEX IF NOT EXISTS idx_poop_memories_compacted ON poop_memories(compacted)`,

  // FTS5 for memory content
  `CREATE VIRTUAL TABLE IF NOT EXISTS poop_memories_fts USING fts5(
    content,
    content='poop_memories',
    content_rowid='id'
  )`,

  // Triggers to keep memory FTS in sync
  `CREATE TRIGGER IF NOT EXISTS poop_memories_ai AFTER INSERT ON poop_memories BEGIN
    INSERT INTO poop_memories_fts(rowid, content) VALUES (new.id, new.content);
  END`,

  `CREATE TRIGGER IF NOT EXISTS poop_memories_ad AFTER DELETE ON poop_memories BEGIN
    INSERT INTO poop_memories_fts(poop_memories_fts, rowid, content) VALUES('delete', old.id, old.content);
  END`,

  `CREATE TRIGGER IF NOT EXISTS poop_memories_au AFTER UPDATE ON poop_memories BEGIN
    INSERT INTO poop_memories_fts(poop_memories_fts, rowid, content) VALUES('delete', old.id, old.content);
    INSERT INTO poop_memories_fts(rowid, content) VALUES (new.id, new.content);
  END`,

  // Config key-value store
  `CREATE TABLE IF NOT EXISTS poop_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

export async function initializeSchema(client: Client): Promise<void> {
  // Enable WAL mode for better concurrent read performance
  await client.execute("PRAGMA journal_mode=WAL");
  await client.execute("PRAGMA foreign_keys=ON");

  for (const sql of SCHEMA_STATEMENTS) {
    await client.execute(sql);
  }

  // Set schema version
  await client.execute({
    sql: "INSERT OR REPLACE INTO poop_config (key, value) VALUES (?, ?)",
    args: ["schema_version", "1"],
  });
}
