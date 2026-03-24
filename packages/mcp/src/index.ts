#!/usr/bin/env node
/**
 * poopabase MCP Server
 *
 * Exposes a poopabase database as MCP tools for AI agents.
 * Tools: search, query, ingest, recall, observe, compact, status
 *
 * Usage:
 *   poop-mcp --db ./mydata.poop.db
 *   poop-mcp --url libsql://mydb.turso.io --token xxx
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient, type Client } from "@libsql/client";
import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Parse args
const args = process.argv.slice(2);
let dbUrl = "";
let authToken = "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--db" && args[i + 1]) {
    dbUrl = `file:${resolve(args[i + 1])}`;
    i++;
  } else if (args[i] === "--url" && args[i + 1]) {
    dbUrl = args[i + 1];
    i++;
  } else if (args[i] === "--token" && args[i + 1]) {
    authToken = args[i + 1];
    i++;
  }
}

// Try to find .poopabase config
if (!dbUrl) {
  const configPath = resolve(".poopabase");
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      if (config.path) {
        dbUrl = `file:${resolve(config.path)}`;
      } else if (config.url) {
        dbUrl = config.url;
        authToken = config.token || "";
      }
    } catch {
      // ignore
    }
  }
}

if (!dbUrl) {
  console.error(
    "No database specified. Use --db <file>, --url <libsql-url>, or create a .poopabase config."
  );
  process.exit(1);
}

// Create libSQL client
const clientConfig: any = { url: dbUrl };
if (authToken) clientConfig.authToken = authToken;
const db: Client = createClient(clientConfig);

// Table name detection — support both poop_ prefixed and non-prefixed schemas
let T = {
  docs: "poop_docs", chunks: "poop_chunks", chunks_fts: "poop_chunks_fts",
  memories: "poop_memories", memories_fts: "poop_memories_fts",
  doc_id: "doc_id", section: "section_heading",
};

async function detectTables() {
  try {
    const result = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
    const tables = new Set(result.rows.map((r: any) => r.name));
    if (tables.has("documents") && !tables.has("poop_docs")) {
      T = {
        docs: "documents", chunks: "chunks", chunks_fts: "chunks_fts",
        memories: "observations", memories_fts: "observations_fts",
        doc_id: "document_id", section: "section",
      };
      // Also check for separate memories table
      if (tables.has("memories")) {
        // Has both observations and memories tables
      }
      console.error("Detected schema: standard (documents/chunks/observations)");
    } else {
      console.error("Detected schema: poop_ prefixed");
    }
  } catch (e) {
    console.error("Could not detect tables:", e);
  }
}
detectTables();

// Sanitize FTS query
function sanitizeFts(query: string): string {
  return query
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => `"${w}"`)
    .join(" OR ");
}

// Create MCP server
const server = new Server(
  { name: "poopabase", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "poopabase_search",
      description:
        "Search documents in the poopabase knowledge base using hybrid BM25 keyword + semantic search. Returns the most relevant chunks with source citations.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Natural language search query",
          },
          limit: {
            type: "number",
            description: "Max results to return (default 10)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "poopabase_query",
      description:
        "Execute a raw SQL query against the poopabase database. Use this for structured data queries, filtering, and aggregations.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sql: { type: "string", description: "SQL query to execute" },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Query parameters",
          },
        },
        required: ["sql"],
      },
    },
    {
      name: "poopabase_ingest",
      description:
        "Ingest a document into the poopabase knowledge base. The content will be chunked, indexed for keyword search, and made searchable.",
      inputSchema: {
        type: "object" as const,
        properties: {
          content: { type: "string", description: "Document content (markdown, text)" },
          source: {
            type: "string",
            description: "Source identifier (filename, URL, etc.)",
          },
          type: {
            type: "string",
            description: "Content type: markdown, text, code",
            enum: ["markdown", "text", "code"],
          },
        },
        required: ["content", "source"],
      },
    },
    {
      name: "poopabase_recall",
      description:
        "Recall memories from the poopabase memory system. Searches stored observations and compacted memories by relevance.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "What to recall — natural language query",
          },
          limit: {
            type: "number",
            description: "Max memories to return (default 5)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "poopabase_observe",
      description:
        "Store an observation in the poopabase memory system. Observations are raw notes that can later be compacted into durable memories.",
      inputSchema: {
        type: "object" as const,
        properties: {
          content: {
            type: "string",
            description: "The observation to store",
          },
          importance: {
            type: "number",
            description: "Importance score 0-1 (default 0.5)",
          },
        },
        required: ["content"],
      },
    },
    {
      name: "poopabase_compact",
      description:
        "Compact observations into durable memories. Groups similar observations and merges them into higher-level memories.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "poopabase_status",
      description:
        "Get poopabase database status: document count, chunk count, memory count, and storage info.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "poopabase_collection_insert",
      description:
        "Insert a document into a schemaless collection. Collections are auto-created on first insert. Like MongoDB — just throw JSON at a named collection.",
      inputSchema: {
        type: "object" as const,
        properties: {
          collection: {
            type: "string",
            description: "Collection name (alphanumeric and underscores only)",
          },
          document: {
            type: "object",
            description: "JSON document to insert",
          },
          id: {
            type: "string",
            description: "Optional document ID (auto-generated UUID if not provided)",
          },
        },
        required: ["collection", "document"],
      },
    },
    {
      name: "poopabase_collection_find",
      description:
        "Find documents in a schemaless collection. Optionally filter by key/value pairs matched against the JSON data.",
      inputSchema: {
        type: "object" as const,
        properties: {
          collection: {
            type: "string",
            description: "Collection name",
          },
          filter: {
            type: "object",
            description: "Optional key/value pairs to filter documents (matched against JSON fields)",
          },
          limit: {
            type: "number",
            description: "Max results to return (default 20)",
          },
        },
        required: ["collection"],
      },
    },
    {
      name: "poopabase_collection_delete",
      description:
        "Delete a document from a schemaless collection by its ID.",
      inputSchema: {
        type: "object" as const,
        properties: {
          collection: {
            type: "string",
            description: "Collection name",
          },
          id: {
            type: "string",
            description: "Document ID to delete",
          },
        },
        required: ["collection", "id"],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: params } = request.params;

  try {
    switch (name) {
      case "poopabase_search": {
        const query = (params as any).query as string;
        const limit = ((params as any).limit as number) || 10;
        const ftsQuery = sanitizeFts(query);

        if (!ftsQuery) {
          return { content: [{ type: "text", text: "Query too short or invalid." }] };
        }

        const results = await db.execute({
          sql: `SELECT c.id, c.content, c.${T.section} as section, d.source, d.type,
                       bm25(${T.chunks_fts}) as score
                FROM ${T.chunks_fts} fts
                JOIN ${T.chunks} c ON c.id = fts.rowid
                JOIN ${T.docs} d ON d.id = c.${T.doc_id}
                WHERE ${T.chunks_fts} MATCH ?
                ORDER BY score
                LIMIT ?`,
          args: [ftsQuery, limit],
        });

        if (results.rows.length === 0) {
          return {
            content: [{ type: "text", text: `No results found for: "${query}"` }],
          };
        }

        const formatted = results.rows
          .map((r: any, i: number) => {
            const section = r.section ? ` [${r.section}]` : "";
            return `**Result ${i + 1}** (source: ${r.source}${section})\n${r.content}`;
          })
          .join("\n\n---\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Found ${results.rows.length} results for "${query}":\n\n${formatted}`,
            },
          ],
        };
      }

      case "poopabase_query": {
        const sql = (params as any).sql as string;
        const queryArgs = ((params as any).args as string[]) || [];
        const result = await db.execute({ sql, args: queryArgs });

        if (result.rows.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `Query executed. ${result.rowsAffected} rows affected. No results returned.`,
              },
            ],
          };
        }

        const columns = result.columns;
        const rows = result.rows.map((r: any) =>
          columns.map((c) => String(r[c] ?? "NULL")).join(" | ")
        );
        const header = columns.join(" | ");
        const table = [header, "-".repeat(header.length), ...rows].join("\n");

        return {
          content: [
            {
              type: "text",
              text: `${result.rows.length} rows returned:\n\n${table}`,
            },
          ],
        };
      }

      case "poopabase_ingest": {
        const content = (params as any).content as string;
        const source = (params as any).source as string;
        const type = ((params as any).type as string) || "markdown";

        // Insert document
        const docResult = await db.execute({
          sql: `INSERT INTO ${T.docs} (source, type, content, metadata, ingested_at) VALUES (?, ?, ?, '{}', datetime('now'))`,
          args: [source, type, content],
        });
        const docId = Number(docResult.lastInsertRowid ?? 0);

        // Chunk the content
        const chunks = chunkContent(content);

        // Insert chunks + FTS
        for (let i = 0; i < chunks.length; i++) {
          await db.execute({
            sql: `INSERT INTO ${T.chunks} (${T.doc_id}, content, ${T.section}, chunk_index) VALUES (?, ?, ?, ?)`,
            args: [Number(docId), chunks[i].text, i, chunks[i].heading || null],
          });
        }

        return {
          content: [
            {
              type: "text",
              text: `Ingested "${source}" (${type}): ${chunks.length} chunks created.`,
            },
          ],
        };
      }

      case "poopabase_recall": {
        const query = (params as any).query as string;
        const limit = ((params as any).limit as number) || 5;
        const ftsQuery = sanitizeFts(query);

        if (!ftsQuery) {
          return { content: [{ type: "text", text: "Query too short." }] };
        }

        // Search both observations and memories FTS indexes
        const allResults: Array<{type: string, content: string}> = [];

        try {
          const obs = await db.execute({
            sql: `SELECT o.id, o.content FROM ${T.memories_fts} fts JOIN ${T.memories} o ON o.id = fts.rowid WHERE ${T.memories_fts} MATCH ? LIMIT ?`,
            args: [ftsQuery, limit],
          });
          obs.rows.forEach((r: any) => allResults.push({ type: "observation", content: r.content }));
        } catch {}

        // Also search memories table if it's separate
        if (T.memories === "observations") {
          try {
            const mems = await db.execute({
              sql: `SELECT m.content FROM memories_fts fts JOIN memories m ON m.id = fts.rowid WHERE memories_fts MATCH ? LIMIT ?`,
              args: [ftsQuery, limit],
            });
            mems.rows.forEach((r: any) => allResults.push({ type: "memory", content: r.content }));
          } catch {}
        }

        if (allResults.length === 0) {
          return {
            content: [
              { type: "text", text: `No memories found for: "${query}"` },
            ],
          };
        }

        const formatted = allResults
          .map((r) => `[${r.type}] ${r.content}`)
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Recalled ${results.rows.length} memories:\n\n${formatted}`,
            },
          ],
        };
      }

      case "poopabase_observe": {
        const content = (params as any).content as string;

        // Adapt to whichever schema exists
        if (T.memories === "observations") {
          // Standard schema: observations table with (content, source)
          await db.execute({
            sql: `INSERT INTO observations (content, source) VALUES (?, 'mcp')`,
            args: [content],
          });
        } else {
          // poop_ schema: poop_memories table with type column
          const importance = ((params as any).importance as number) || 0.5;
          await db.execute({
            sql: `INSERT INTO ${T.memories} (type, content, importance, metadata, created_at, accessed_at, access_count) VALUES ('observation', ?, ?, '{}', datetime('now'), datetime('now'), 0)`,
            args: [content, importance],
          });
        }

        return {
          content: [{ type: "text", text: `Observation stored.` }],
        };
      }

      case "poopabase_compact": {
        // Simple compaction: find observations, group similar ones
        let observations: any;
        if (T.memories === "observations") {
          observations = await db.execute({ sql: "SELECT id, content FROM observations ORDER BY created_at DESC LIMIT 100", args: [] });
        } else {
          observations = await db.execute({ sql: `SELECT id, content FROM ${T.memories} WHERE type = 'observation' ORDER BY created_at DESC LIMIT 100`, args: [] });
        }

        if (observations.rows.length < 3) {
          return {
            content: [
              {
                type: "text",
                text: `Not enough observations to compact (${observations.rows.length}, need 3+).`,
              },
            ],
          };
        }

        // Group by finding observations that share significant words
        const groups: Map<string, any[]> = new Map();
        for (const obs of observations.rows) {
          const words = String((obs as any).content)
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 4);
          const key = words.slice(0, 3).sort().join("_") || "misc";
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(obs);
        }

        let memoriesCreated = 0;
        let observationsPruned = 0;

        for (const [, group] of groups) {
          if (group.length >= 3) {
            const merged = group.map((o: any) => o.content).join(" | ");
            const summary =
              merged.length > 500 ? merged.substring(0, 500) + "..." : merged;

            if (T.memories === "observations") {
              await db.execute({ sql: "INSERT INTO memories (content) VALUES (?)", args: [summary] });
            } else {
              await db.execute({
                sql: `INSERT INTO ${T.memories} (type, content, importance, metadata, created_at, accessed_at, access_count) VALUES ('memory', ?, 0.7, '{}', datetime('now'), datetime('now'), 0)`,
                args: [summary],
              });
            }
            memoriesCreated++;

            for (const obs of group) {
              if (T.memories === "observations") {
                await db.execute({ sql: "DELETE FROM observations WHERE id = ?", args: [(obs as any).id] });
              } else {
                await db.execute({ sql: `UPDATE ${T.memories} SET type = 'compacted' WHERE id = ?`, args: [(obs as any).id] });
              }
              observationsPruned++;
            }
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Compaction complete: ${memoriesCreated} memories created, ${observationsPruned} observations compacted.`,
            },
          ],
        };
      }

      case "poopabase_status": {
        const docs = await db.execute(`SELECT COUNT(*) as c FROM ${T.docs}`);
        const chunks = await db.execute(`SELECT COUNT(*) as c FROM ${T.chunks}`);

        // Handle both schema types for memory stats
        let obsCount = 0, memCount = 0;
        try {
          const obs = await db.execute(`SELECT COUNT(*) as c FROM observations`);
          obsCount = Number((obs.rows[0] as any).c);
        } catch {}
        try {
          const mem = await db.execute(`SELECT COUNT(*) as c FROM memories`);
          memCount = Number((mem.rows[0] as any).c);
        } catch {}
        // Also try poop_ prefixed
        if (obsCount === 0 && memCount === 0) {
          try {
            const pm = await db.execute(`SELECT type, COUNT(*) as c FROM ${T.memories} GROUP BY type`);
            pm.rows.forEach((r: any) => {
              if (r.type === "observation") obsCount = Number(r.c);
              else if (r.type === "memory") memCount = Number(r.c);
            });
          } catch {}
        }

        // Count messages/conversations if they exist
        let msgCount = 0, convCount = 0;
        try {
          const msgs = await db.execute("SELECT COUNT(*) as c FROM messages");
          msgCount = Number((msgs.rows[0] as any).c);
          const convs = await db.execute("SELECT COUNT(*) as c FROM conversations");
          convCount = Number((convs.rows[0] as any).c);
        } catch {}

        const memStats = { observation: obsCount, memory: memCount };

        return {
          content: [
            {
              type: "text",
              text: [
                `poopabase status:`,
                `  Documents: ${(docs.rows[0] as any).c}`,
                `  Chunks: ${(chunks.rows[0] as any).c}`,
                `  Observations: ${memStats.observation || 0}`,
                `  Memories: ${memStats.memory || 0}`,
                ...(convCount ? [`  Conversations: ${convCount}`, `  Messages: ${msgCount}`] : []),
              ].join("\n"),
            },
          ],
        };
      }

      case "poopabase_collection_insert": {
        const collection = ((params as any).collection as string).replace(/[^a-zA-Z0-9_]/g, "");
        if (!collection) {
          return { content: [{ type: "text", text: "Invalid collection name." }], isError: true };
        }
        const document = (params as any).document as Record<string, unknown>;
        const docId = ((params as any).id as string) || randomUUID();

        await db.execute({
          sql: `CREATE TABLE IF NOT EXISTS _col_${collection} (id TEXT PRIMARY KEY, data JSON NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
          args: [],
        });

        await db.execute({
          sql: `INSERT INTO _col_${collection} (id, data) VALUES (?, json(?))`,
          args: [docId, JSON.stringify(document)],
        });

        return {
          content: [
            {
              type: "text",
              text: `Inserted into "${collection}" with id: ${docId}\n\n${JSON.stringify({ id: docId, ...document }, null, 2)}`,
            },
          ],
        };
      }

      case "poopabase_collection_find": {
        const collection = ((params as any).collection as string).replace(/[^a-zA-Z0-9_]/g, "");
        if (!collection) {
          return { content: [{ type: "text", text: "Invalid collection name." }], isError: true };
        }
        const filter = (params as any).filter as Record<string, unknown> | undefined;
        const limit = ((params as any).limit as number) || 20;

        // Check if the collection table exists
        const tableCheck = await db.execute({
          sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
          args: [`_col_${collection}`],
        });
        if (tableCheck.rows.length === 0) {
          return { content: [{ type: "text", text: `Collection "${collection}" does not exist yet. No documents found.` }] };
        }

        let sql: string;
        const queryArgs: any[] = [];

        if (filter && Object.keys(filter).length > 0) {
          const conditions = Object.entries(filter).map(([key, value]) => {
            queryArgs.push(String(value));
            return `data->>'$.${key}' = ?`;
          });
          sql = `SELECT id, data, created_at FROM _col_${collection} WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`;
        } else {
          sql = `SELECT id, data, created_at FROM _col_${collection} ORDER BY created_at DESC LIMIT ?`;
        }
        queryArgs.push(limit);

        const results = await db.execute({ sql, args: queryArgs });

        if (results.rows.length === 0) {
          return { content: [{ type: "text", text: `No documents found in "${collection}".` }] };
        }

        const formatted = results.rows
          .map((r: any, i: number) => {
            let data: any;
            try {
              data = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
            } catch {
              data = r.data;
            }
            return `**${i + 1}.** id: \`${r.id}\` (${r.created_at})\n${JSON.stringify(data, null, 2)}`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Found ${results.rows.length} document(s) in "${collection}":\n\n${formatted}`,
            },
          ],
        };
      }

      case "poopabase_collection_delete": {
        const collection = ((params as any).collection as string).replace(/[^a-zA-Z0-9_]/g, "");
        if (!collection) {
          return { content: [{ type: "text", text: "Invalid collection name." }], isError: true };
        }
        const docId = (params as any).id as string;

        // Check if the collection table exists
        const tableCheck = await db.execute({
          sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
          args: [`_col_${collection}`],
        });
        if (tableCheck.rows.length === 0) {
          return { content: [{ type: "text", text: `Collection "${collection}" does not exist.` }] };
        }

        const result = await db.execute({
          sql: `DELETE FROM _col_${collection} WHERE id = ?`,
          args: [docId],
        });

        if (result.rowsAffected === 0) {
          return { content: [{ type: "text", text: `No document found with id "${docId}" in "${collection}".` }] };
        }

        return {
          content: [
            {
              type: "text",
              text: `Deleted document "${docId}" from collection "${collection}".`,
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Simple chunker for the MCP server (self-contained)
function chunkContent(
  content: string
): Array<{ text: string; heading: string | null }> {
  const chunks: Array<{ text: string; heading: string | null }> = [];
  const lines = content.split("\n");
  let currentChunk = "";
  let currentHeading: string | null = null;
  const TARGET = 500;

  for (const line of lines) {
    // Check for markdown heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      // Flush current chunk
      if (currentChunk.trim()) {
        chunks.push({ text: currentChunk.trim(), heading: currentHeading });
      }
      currentHeading = headingMatch[2];
      currentChunk = line + "\n";
      continue;
    }

    currentChunk += line + "\n";

    // Split on paragraph boundaries if chunk is long enough
    if (currentChunk.length >= TARGET && line.trim() === "") {
      chunks.push({ text: currentChunk.trim(), heading: currentHeading });
      currentChunk = "";
    }
  }

  // Final chunk
  if (currentChunk.trim()) {
    chunks.push({ text: currentChunk.trim(), heading: currentHeading });
  }

  return chunks.length > 0
    ? chunks
    : [{ text: content, heading: null }];
}

// Start server
async function main() {
  await detectTables();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("poopabase MCP server running");
  console.error(`Database: ${dbUrl}`);
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
