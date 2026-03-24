/**
 * SQL statements to initialize a poopabase database schema.
 */
export const SCHEMA_SQL = [
  // Documents table
  `CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    title TEXT,
    type TEXT DEFAULT 'text',
    content TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  // Chunks table
  `CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    section TEXT,
    chunk_index INTEGER NOT NULL,
    char_offset INTEGER DEFAULT 0,
    embedding BLOB,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // FTS5 virtual table for full-text search on chunks
  `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    content,
    section,
    content=chunks,
    content_rowid=id,
    tokenize='porter unicode61'
  )`,

  // Triggers to keep FTS in sync
  `CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, content, section)
    VALUES (new.id, new.content, new.section);
  END`,

  `CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, content, section)
    VALUES ('delete', old.id, old.content, old.section);
  END`,

  `CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, content, section)
    VALUES ('delete', old.id, old.content, old.section);
    INSERT INTO chunks_fts(rowid, content, section)
    VALUES (new.id, new.content, new.section);
  END`,

  // Observations table (raw observations/notes)
  `CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    source TEXT DEFAULT 'cli',
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // Memories table (compacted/merged observations)
  `CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'memory',
    strength REAL DEFAULT 1.0,
    observation_ids TEXT DEFAULT '[]',
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  // FTS for observations
  `CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
    content,
    content=observations,
    content_rowid=id,
    tokenize='porter unicode61'
  )`,

  `CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, content) VALUES (new.id, new.content);
  END`,

  `CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, content)
    VALUES ('delete', old.id, old.content);
  END`,

  // FTS for memories
  `CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    content,
    content=memories,
    content_rowid=id,
    tokenize='porter unicode61'
  )`,

  `CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
  END`,

  `CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content)
    VALUES ('delete', old.id, old.content);
  END`,

  `CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content)
    VALUES ('delete', old.id, old.content);
    INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
  END`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_section ON chunks(section)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source)`,
  `CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)`,
  `CREATE INDEX IF NOT EXISTS idx_memories_strength ON memories(strength DESC)`,
];
