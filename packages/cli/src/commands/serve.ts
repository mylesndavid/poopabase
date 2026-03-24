import { createClient, type Client, type InValue } from "@libsql/client";
import chalk from "chalk";
import crypto from "node:crypto";
import http from "node:http";
import { getDatabase, getDatabaseUrl } from "../utils.js";

const STOP_WORDS = new Set(["a","an","the","is","are","was","were","do","does","did","how","what","when","where","why","who","which","that","this","it","in","on","at","to","for","of","with","by","from","and","or","not","no","can","will","should","would","could","has","have","had"]);
function sanitizeFts(query: string): string {
  const words = query.replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()));
  return words.length ? words.map(w => `"${w}"`).join(" OR ") : query.replace(/[^\w\s]/g, "");
}

interface RequestBody {
  sql?: string;
  args?: unknown[];
  query?: string;
  options?: Record<string, unknown>;
  content?: string;
  source?: string;
  type?: string;
  limit?: number;
}

async function readBody(req: http.IncomingMessage): Promise<RequestBody> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function json(
  res: http.ServerResponse,
  data: unknown,
  status = 200
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function errorResponse(
  res: http.ServerResponse,
  message: string,
  status = 400
): void {
  json(res, { error: message }, status);
}

const MCP_TOOLS = [
  {
    name: "poopabase_query",
    description: "Execute a SQL query against the poopabase database",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SQL query to execute" },
        args: {
          type: "array",
          items: {},
          description: "Query parameters",
        },
      },
      required: ["sql"],
    },
  },
  {
    name: "poopabase_search",
    description: "Search documents using full-text search",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "poopabase_ingest",
    description: "Ingest a document into the database",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Document content" },
        source: { type: "string", description: "Source identifier" },
        type: { type: "string", description: "Document type" },
      },
      required: ["content"],
    },
  },
  {
    name: "poopabase_observe",
    description: "Store an observation/memory",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Observation text" },
      },
      required: ["content"],
    },
  },
  {
    name: "poopabase_recall",
    description: "Search memories and observations",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "poopabase_compact",
    description: "Compact observations into memories",
    inputSchema: { type: "object", properties: {} },
  },
];

export async function serveCommand(options: {
  port?: string;
  db?: string;
  url?: string;
  token?: string;
  mcp?: boolean;
}): Promise<void> {
  const port = parseInt(options.port || "3141", 10);

  let client: Client;
  let dbLabel: string;
  if (options.url) {
    const config: any = { url: options.url };
    if (options.token) config.authToken = options.token;
    client = createClient(config);
    dbLabel = options.url;
  } else {
    const dbPath = getDatabase(options.db);
    client = createClient({ url: getDatabaseUrl(dbPath) });
    dbLabel = dbPath;
  }

  if (options.mcp) {
    // Output MCP tool definitions to stdout
    console.log(JSON.stringify({ tools: MCP_TOOLS }, null, 2));
  }

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://localhost:${port}`);
    const pathname = url.pathname;

    // Log all requests for debugging
    if (pathname !== "/health") {
      console.log(chalk.dim(`  ${req.method} ${pathname}`));
    }

    try {
      // Hrana v2/v3 pipeline endpoint (used by libsql-stateless-easy / Outerbase Studio)
      if ((pathname === "/v2/pipeline" || pathname === "/v3/pipeline") && req.method === "POST") {
        const body = await readBody(req) as any;
        const requests = body.requests || [];
        const results: any[] = [];

        for (const request of requests) {
          if (request.type === "execute") {
            try {
              const stmt = request.stmt;
              const sql = (stmt.sql || "").trim();
              const args = (stmt.args || []).map((a: any) => {
                if (a && typeof a === "object" && "value" in a) return a.value;
                return a;
              });

              // Silently succeed on transaction control that may not apply
              const sqlUpper = sql.replace(/;/g, "").trim().toUpperCase();
              if (sqlUpper.startsWith("ROLLBACK") || sqlUpper === "COMMIT" || sqlUpper === "END" || sqlUpper.startsWith("BEGIN")) {
                try {
                  await client.execute({ sql, args });
                } catch {
                  // Ignore - no active transaction is fine
                }
                results.push({
                  type: "ok",
                  response: {
                    type: "execute",
                    result: {
                      cols: [],
                      rows: [],
                      affected_row_count: 0,
                      last_insert_rowid: null,
                      replication_index: null,
                    },
                  },
                });
                continue;
              }

              const result = await client.execute({ sql, args });
              results.push({
                type: "ok",
                response: {
                  type: "execute",
                  result: {
                    cols: result.columns.map((name, i) => ({
                      name,
                      decltype: result.columnTypes?.[i] || null,
                    })),
                    rows: result.rows.map((row) =>
                      result.columns.map((col, i) => {
                        const val = (row as any)[col] ?? (row as any)[i] ?? null;
                        if (val === null) return { type: "null" };
                        if (typeof val === "number") return { type: "integer", value: String(val) };
                        if (typeof val === "bigint") return { type: "integer", value: String(val) };
                        if (typeof val === "string") return { type: "text", value: val };
                        if (val instanceof Uint8Array) return { type: "blob", base64: Buffer.from(val).toString("base64") };
                        return { type: "text", value: String(val) };
                      })
                    ),
                    affected_row_count: result.rowsAffected,
                    last_insert_rowid: result.lastInsertRowid != null ? String(result.lastInsertRowid) : null,
                    replication_index: null,
                  },
                },
              });
            } catch (err: any) {
              results.push({
                type: "error",
                error: { message: err.message, code: "UNKNOWN" },
              });
            }
          } else if (request.type === "batch") {
            const steps = request.batch?.steps || [];
            const stepResults: (any | null)[] = new Array(steps.length).fill(null);
            const stepErrors: (any | null)[] = new Array(steps.length).fill(null);
            let isAutocommit = true;

            function evalCondition(cond: any): boolean {
              if (!cond) return true;
              if (cond.type === "ok") return stepResults[cond.step] !== null && stepErrors[cond.step] === null;
              if (cond.type === "error") return stepErrors[cond.step] !== null;
              if (cond.type === "not") return !evalCondition(cond.cond);
              if (cond.type === "and") return (cond.conds || []).every(evalCondition);
              if (cond.type === "or") return (cond.conds || []).some(evalCondition);
              if (cond.type === "is_autocommit") return isAutocommit;
              return true;
            }

            for (let si = 0; si < steps.length; si++) {
              const step = steps[si];
              if (!evalCondition(step.condition)) continue;

              const stmt = step.stmt || step;
              const sql = (stmt.sql || "").trim();
              const args = (stmt.args || []).map((a: any) => {
                if (a && typeof a === "object" && "value" in a) return a.value;
                return a;
              });

              try {
                const sqlUpper = sql.replace(/;/g, "").trim().toUpperCase();
                if (sqlUpper.startsWith("BEGIN")) isAutocommit = false;
                if (sqlUpper.startsWith("COMMIT") || sqlUpper.startsWith("ROLLBACK") || sqlUpper === "END") isAutocommit = true;

                const result = await client.execute({ sql, args });
                stepResults[si] = {
                  cols: result.columns.map((name, i) => ({ name, decltype: result.columnTypes?.[i] || null })),
                  rows: result.rows.map((row) =>
                    result.columns.map((col, i) => {
                      const val = (row as any)[col] ?? (row as any)[i] ?? null;
                      if (val === null) return { type: "null" };
                      if (typeof val === "number") return { type: "integer", value: String(val) };
                      if (typeof val === "bigint") return { type: "integer", value: String(val) };
                      if (typeof val === "string") return { type: "text", value: val };
                      return { type: "text", value: String(val) };
                    })
                  ),
                  affected_row_count: result.rowsAffected,
                  last_insert_rowid: result.lastInsertRowid != null ? String(result.lastInsertRowid) : null,
                  replication_index: null,
                };
              } catch (err: any) {
                stepErrors[si] = { message: err.message, code: "UNKNOWN" };
              }
            }

            results.push({
              type: "ok",
              response: { type: "batch", result: { step_results: stepResults, step_errors: stepErrors } },
            });
          } else if (request.type === "close") {
            results.push({ type: "ok", response: { type: "close" } });
          } else {
            results.push({ type: "ok", response: { type: request.type } });
          }
        }

        json(res, { baton: null, base_url: null, results });
        return;
      }

      // Hrana v3 health check
      if ((pathname === "/v3" || pathname === "/v2") && req.method === "GET") {
        json(res, { version: "3" });
        return;
      }

      // GET /health
      if (pathname === "/health" && req.method === "GET") {
        json(res, { status: "ok", database: dbLabel });
        return;
      }

      // POST /query
      if (pathname === "/query" && req.method === "POST") {
        const body = await readBody(req);
        if (!body.sql) {
          errorResponse(res, "Missing 'sql' field");
          return;
        }
        const result = await client.execute({
          sql: body.sql,
          args: (body.args as any[]) || [],
        });
        json(res, {
          columns: result.columns,
          rows: result.rows,
          rowsAffected: result.rowsAffected,
        });
        return;
      }

      // POST /search
      if (pathname === "/search" && req.method === "POST") {
        const body = await readBody(req);
        if (!body.query) {
          errorResponse(res, "Missing 'query' field");
          return;
        }
        const limit = body.limit || (body.options as any)?.limit || 10;
        const result = await client.execute({
          sql: `
            SELECT c.id, c.content, c.section, d.source, d.title, rank as score
            FROM chunks_fts
            JOIN chunks c ON c.id = chunks_fts.rowid
            JOIN documents d ON d.id = c.document_id
            WHERE chunks_fts MATCH ?
            ORDER BY rank
            LIMIT ?
          `,
          args: [sanitizeFts(body.query), limit],
        });
        json(res, { results: result.rows });
        return;
      }

      // POST /docs/ingest
      if (pathname === "/docs/ingest" && req.method === "POST") {
        const body = await readBody(req);
        if (!body.content) {
          errorResponse(res, "Missing 'content' field");
          return;
        }
        await ingestDocument(client, body);
        json(res, { ok: true });
        return;
      }

      // GET /docs
      if (pathname === "/docs" && req.method === "GET") {
        const result = await client.execute(
          "SELECT id, source, title, type, created_at FROM documents ORDER BY created_at DESC"
        );
        json(res, { documents: result.rows });
        return;
      }

      // POST /memory/observe
      if (pathname === "/memory/observe" && req.method === "POST") {
        const body = await readBody(req);
        if (!body.content) {
          errorResponse(res, "Missing 'content' field");
          return;
        }
        const result = await client.execute({
          sql: "INSERT INTO observations (content, source) VALUES (?, ?)",
          args: [body.content, body.source || "api"],
        });
        json(res, { id: Number(result.lastInsertRowid) });
        return;
      }

      // POST /memory/recall
      if (pathname === "/memory/recall" && req.method === "POST") {
        const body = await readBody(req);
        if (!body.query) {
          errorResponse(res, "Missing 'query' field");
          return;
        }
        const limit = body.limit || 10;

        const ftsQuery = sanitizeFts(body.query);
        const observations = await client.execute({
          sql: `SELECT o.id, o.content, o.created_at, rank as score
                FROM observations_fts
                JOIN observations o ON o.id = observations_fts.rowid
                WHERE observations_fts MATCH ?
                ORDER BY rank LIMIT ?`,
          args: [ftsQuery, limit],
        });

        const memories = await client.execute({
          sql: `SELECT m.id, m.content, m.type, m.strength, m.created_at, rank as score
                FROM memories_fts
                JOIN memories m ON m.id = memories_fts.rowid
                WHERE memories_fts MATCH ?
                ORDER BY rank LIMIT ?`,
          args: [ftsQuery, limit],
        });

        json(res, {
          observations: observations.rows,
          memories: memories.rows,
        });
        return;
      }

      // POST /memory/compact
      if (pathname === "/memory/compact" && req.method === "POST") {
        await compactMemories(client);
        json(res, { ok: true });
        return;
      }

      // GET /status
      if (pathname === "/status" && req.method === "GET") {
        const stats = await getStats(client);
        json(res, stats);
        return;
      }

      // GET /collections — List all collections
      if (pathname === "/collections" && req.method === "GET") {
        const result = await client.execute(
          `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_col_%' ORDER BY name`
        );
        const collections: { name: string; count: number }[] = [];
        for (const row of result.rows) {
          const tbl = String(row.name);
          const countResult = await client.execute(`SELECT COUNT(*) as count FROM "${tbl}"`);
          collections.push({
            name: tbl.replace(/^_col_/, ""),
            count: Number(countResult.rows[0].count),
          });
        }
        json(res, { collections });
        return;
      }

      // Collections CRUD: /collections/:name and /collections/:name/:id
      const colMatch = pathname.match(/^\/collections\/([^/]+)(?:\/([^/]+))?$/);
      if (colMatch) {
        const rawName = colMatch[1];
        const docId = colMatch[2];
        const safeName = rawName.replace(/[^a-zA-Z0-9_]/g, "");
        const table = `_col_${safeName}`;

        // DELETE /collections/:name/:id — Delete document
        if (req.method === "DELETE" && docId) {
          const result = await client.execute({
            sql: `DELETE FROM "${table}" WHERE id = ?`,
            args: [docId],
          });
          if (result.rowsAffected === 0) {
            errorResponse(res, "Document not found", 404);
          } else {
            json(res, { ok: true, id: docId });
          }
          return;
        }

        // POST /collections/:name — Insert document
        if (req.method === "POST" && !docId) {
          const body = await readBody(req) as any;
          const data = body.data;
          if (!data || typeof data !== "object") {
            errorResponse(res, "Missing 'data' object in body");
            return;
          }

          // Ensure collection table exists
          await client.execute(`
            CREATE TABLE IF NOT EXISTS "${table}" (
              id TEXT PRIMARY KEY,
              data JSON NOT NULL,
              created_at TEXT DEFAULT (datetime('now')),
              updated_at TEXT DEFAULT (datetime('now'))
            )
          `);

          const id = body.id || crypto.randomUUID();
          await client.execute({
            sql: `INSERT INTO "${table}" (id, data) VALUES (?, ?)`,
            args: [id, JSON.stringify(data)],
          });

          json(res, { ok: true, id, data }, 201);
          return;
        }

        // GET /collections/:name — Find documents
        if (req.method === "GET" && !docId) {
          // Check if collection exists
          const tableCheck = await client.execute({
            sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
            args: [table],
          });
          if (tableCheck.rows.length === 0) {
            errorResponse(res, `Collection "${safeName}" not found`, 404);
            return;
          }

          const filterParam = url.searchParams.get("filter");
          const limit = parseInt(url.searchParams.get("limit") || "20", 10);

          let sql: string;
          const args: InValue[] = [];

          if (filterParam) {
            let filterObj: Record<string, unknown>;
            try {
              filterObj = JSON.parse(filterParam);
            } catch {
              errorResponse(res, "Invalid filter JSON");
              return;
            }

            const conditions = Object.entries(filterObj).map(([key, value]) => {
              args.push(JSON.stringify(value));
              return `json_extract(data, '$.${key.replace(/'/g, "''")}') = json_extract(?, '$')`;
            });
            sql = `SELECT id, data, created_at, updated_at FROM "${table}" WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`;
            args.push(limit);
          } else {
            sql = `SELECT id, data, created_at, updated_at FROM "${table}" ORDER BY created_at DESC LIMIT ?`;
            args.push(limit);
          }

          const result = await client.execute({ sql, args });
          const documents = result.rows.map((row) => ({
            id: row.id,
            data: JSON.parse(String(row.data)),
            created_at: row.created_at,
            updated_at: row.updated_at,
          }));

          json(res, { documents });
          return;
        }
      }

      // 404
      errorResponse(res, "Not found", 404);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errorResponse(res, msg, 500);
    }
  });

  server.listen(port, () => {
    console.log();
    console.log(
      chalk.bold(`  Poopabase server running on port ${chalk.cyan(String(port))}`)
    );
    console.log(chalk.dim(`  Database: ${dbLabel}`));
    console.log();
    console.log(chalk.dim("  Endpoints:"));
    console.log(chalk.dim(`    GET  http://localhost:${port}/health`));
    console.log(chalk.dim(`    POST http://localhost:${port}/query`));
    console.log(chalk.dim(`    POST http://localhost:${port}/search`));
    console.log(chalk.dim(`    POST http://localhost:${port}/docs/ingest`));
    console.log(chalk.dim(`    GET  http://localhost:${port}/docs`));
    console.log(chalk.dim(`    POST http://localhost:${port}/memory/observe`));
    console.log(chalk.dim(`    POST http://localhost:${port}/memory/recall`));
    console.log(chalk.dim(`    POST http://localhost:${port}/memory/compact`));
    console.log(chalk.dim(`    GET  http://localhost:${port}/status`));
    console.log(chalk.dim(`    POST http://localhost:${port}/collections/:name`));
    console.log(chalk.dim(`    GET  http://localhost:${port}/collections/:name`));
    console.log(chalk.dim(`    DELETE http://localhost:${port}/collections/:name/:id`));
    console.log(chalk.dim(`    GET  http://localhost:${port}/collections`));
    console.log();
    if (options.mcp) {
      console.log(
        chalk.magenta("  MCP tools exported to stdout")
      );
      console.log();
    }
  });
}

async function ingestDocument(
  client: Client,
  body: RequestBody
): Promise<void> {
  const content = body.content!;
  const source = body.source || "api";
  const type = body.type || "text";

  const docResult = await client.execute({
    sql: "INSERT INTO documents (source, title, type, content) VALUES (?, ?, ?, ?)",
    args: [source, source, type, content],
  });

  const documentId = Number(docResult.lastInsertRowid);

  // Simple chunking for API ingest
  const chunks = content.match(/.{1,500}/gs) || [content];
  for (let i = 0; i < chunks.length; i++) {
    await client.execute({
      sql: "INSERT INTO chunks (document_id, content, chunk_index) VALUES (?, ?, ?)",
      args: [documentId, chunks[i], i],
    });
  }
}

async function compactMemories(client: Client): Promise<void> {
  const obsResult = await client.execute(`
    SELECT id, content FROM observations
    WHERE id NOT IN (
      SELECT value FROM memories, json_each(memories.observation_ids)
    )
    ORDER BY created_at
  `);

  const observations = obsResult.rows;
  const groups: Array<Array<{ id: number; content: string }>> = [];
  let current: Array<{ id: number; content: string }> = [];

  for (const row of observations) {
    current.push({ id: Number(row.id), content: String(row.content) });
    if (current.length >= 5) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);

  for (const group of groups) {
    const merged = group.map((o) => o.content).join("\n---\n");
    const ids = group.map((o) => o.id);
    const summary =
      group.length === 1
        ? group[0].content
        : `Compacted from ${group.length} observations:\n${merged}`;

    await client.execute({
      sql: "INSERT INTO memories (content, type, strength, observation_ids) VALUES (?, 'compacted', ?, ?)",
      args: [summary, Math.min(group.length, 5), JSON.stringify(ids)],
    });
  }
}

async function getStats(client: Client): Promise<Record<string, unknown>> {
  const docs = await client.execute(
    "SELECT COUNT(*) as count FROM documents"
  );
  const chunks = await client.execute(
    "SELECT COUNT(*) as count FROM chunks"
  );
  const obs = await client.execute(
    "SELECT COUNT(*) as count FROM observations"
  );
  const mems = await client.execute(
    "SELECT COUNT(*) as count FROM memories"
  );

  return {
    documents: Number(docs.rows[0].count),
    chunks: Number(chunks.rows[0].count),
    observations: Number(obs.rows[0].count),
    memories: Number(mems.rows[0].count),
  };
}
