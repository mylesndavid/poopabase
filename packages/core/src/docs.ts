import type { Client } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { chunkDocument } from "./chunker.js";
import type { Document, SearchOptions, SearchResult } from "./types.js";

export class DocsManager {
  constructor(private client: Client) {}

  /**
   * Ingest a string of content, chunking it and storing in the database.
   */
  async ingest(
    content: string,
    options: {
      source: string;
      type?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<Document> {
    const type = options.type ?? inferType(options.source);
    const metadata = options.metadata ?? {};

    // Insert the document
    const docResult = await this.client.execute({
      sql: `INSERT INTO poop_docs (source, type, content, raw_content, metadata)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        options.source,
        type,
        content,
        content,
        JSON.stringify(metadata),
      ],
    });

    const docId = Number(docResult.lastInsertRowid);

    // Chunk the content and insert chunks
    const chunks = chunkDocument(content);
    for (const chunk of chunks) {
      const sectionHeading = chunk.metadata.section.join(" > ") || null;
      await this.client.execute({
        sql: `INSERT INTO poop_chunks (doc_id, content, position, section_heading, metadata)
              VALUES (?, ?, ?, ?, ?)`,
        args: [
          docId,
          chunk.content,
          chunk.metadata.position,
          sectionHeading,
          JSON.stringify(chunk.metadata),
        ],
      });
    }

    // Return the created document
    return {
      id: docId,
      source: options.source,
      type,
      content,
      metadata,
      ingestedAt: new Date().toISOString(),
    };
  }

  /**
   * Ingest from a file path. Reads the file and delegates to ingest().
   */
  async ingestFile(
    filePath: string,
    metadata?: Record<string, any>
  ): Promise<Document> {
    const content = await readFile(filePath, "utf-8");
    const source = basename(filePath);
    const type = inferType(filePath);
    return this.ingest(content, { source, type, metadata });
  }

  /**
   * Hybrid search across document chunks using BM25 (FTS5) with RRF fusion.
   * TODO: Add vector similarity search once embedding model is integrated.
   */
  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const limit = options?.limit ?? 10;
    const mode = options?.mode ?? "hybrid";
    const expandContext = options?.expandContext ?? 0;
    const filter = options?.filter;

    // BM25 keyword search via FTS5
    let keywordResults: Array<{ id: number; rank: number }> = [];
    if (mode === "keyword" || mode === "hybrid") {
      keywordResults = await this.ftsSearch(query, 100);
    }

    // TODO: Vector similarity search
    // For now, in hybrid mode we only use keyword results.
    // When vector search is added, run it here and fuse with RRF.
    let vectorResults: Array<{ id: number; rank: number }> = [];
    if (mode === "vector" || mode === "hybrid") {
      // Placeholder: vector search not yet implemented
      // vectorResults = await this.vectorSearch(query, 100);
    }

    // Reciprocal Rank Fusion
    const fused = reciprocalRankFusion(keywordResults, vectorResults);

    // Fetch full chunk data for top results
    const topIds = fused.slice(0, limit);
    const results: SearchResult[] = [];

    for (const { id, score } of topIds) {
      const row = await this.client.execute({
        sql: `SELECT c.id, c.content, c.doc_id, c.position, c.metadata, c.section_heading,
                     d.source, d.metadata as doc_metadata
              FROM poop_chunks c
              JOIN poop_docs d ON c.doc_id = d.id
              WHERE c.id = ?`,
        args: [id],
      });

      if (row.rows.length === 0) continue;

      const r = row.rows[0];
      const chunkMeta = safeJsonParse(r.metadata as string);
      const docMeta = safeJsonParse(r.doc_metadata as string);
      const mergedMeta = { ...docMeta, ...chunkMeta };

      // Apply metadata filter
      if (filter && !matchesFilter(mergedMeta, filter)) {
        continue;
      }

      const result: SearchResult = {
        id: r.id as number,
        content: r.content as string,
        score,
        source: r.source as string,
        metadata: mergedMeta,
      };

      // Expand context if requested
      if (expandContext > 0) {
        result.context = await this.getContext(
          r.id as number,
          expandContext
        );
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Get surrounding chunks for context.
   */
  async getContext(
    chunkId: number,
    windowSize: number = 2
  ): Promise<string[]> {
    // First get the chunk's doc_id and position
    const chunk = await this.client.execute({
      sql: "SELECT doc_id, position FROM poop_chunks WHERE id = ?",
      args: [chunkId],
    });

    if (chunk.rows.length === 0) return [];

    const docId = chunk.rows[0].doc_id as number;
    const position = chunk.rows[0].position as number;

    // Get surrounding chunks
    const surrounding = await this.client.execute({
      sql: `SELECT content FROM poop_chunks
            WHERE doc_id = ? AND position BETWEEN ? AND ? AND id != ?
            ORDER BY position ASC`,
      args: [docId, position - windowSize, position + windowSize, chunkId],
    });

    return surrounding.rows.map((r) => r.content as string);
  }

  /**
   * List all ingested documents.
   */
  async list(): Promise<Document[]> {
    const result = await this.client.execute(
      "SELECT id, source, type, content, metadata, ingested_at FROM poop_docs ORDER BY ingested_at DESC"
    );

    return result.rows.map((r) => ({
      id: r.id as number,
      source: r.source as string,
      type: r.type as string,
      content: r.content as string,
      metadata: safeJsonParse(r.metadata as string),
      ingestedAt: r.ingested_at as string,
    }));
  }

  /**
   * Delete a document and all its chunks. Cascade handles chunk deletion.
   */
  async delete(docId: number): Promise<void> {
    // Delete FTS entries for chunks first (triggers handle this on chunk delete,
    // but we need to manually handle since we're deleting via cascade)
    const chunks = await this.client.execute({
      sql: "SELECT id, content FROM poop_chunks WHERE doc_id = ?",
      args: [docId],
    });

    for (const chunk of chunks.rows) {
      await this.client.execute({
        sql: "INSERT INTO poop_chunks_fts(poop_chunks_fts, rowid, content) VALUES('delete', ?, ?)",
        args: [chunk.id, chunk.content],
      });
    }

    // Delete chunks explicitly (to avoid trigger double-delete on FTS)
    await this.client.execute({
      sql: "DELETE FROM poop_chunks WHERE doc_id = ?",
      args: [docId],
    });

    // Delete the document
    await this.client.execute({
      sql: "DELETE FROM poop_docs WHERE id = ?",
      args: [docId],
    });
  }

  /**
   * Run FTS5 BM25 search, returning chunk IDs with their rank position.
   */
  private async ftsSearch(
    query: string,
    limit: number
  ): Promise<Array<{ id: number; rank: number }>> {
    // Escape FTS5 special characters and build query
    const ftsQuery = sanitizeFtsQuery(query);
    if (!ftsQuery) return [];

    const result = await this.client.execute({
      sql: `SELECT rowid, rank
            FROM poop_chunks_fts
            WHERE poop_chunks_fts MATCH ?
            ORDER BY rank
            LIMIT ?`,
      args: [ftsQuery, limit],
    });

    return result.rows.map((r, index) => ({
      id: r.rowid as number,
      rank: index + 1,
    }));
  }
}

/**
 * Reciprocal Rank Fusion: combines ranked lists into a single scored list.
 * score = sum(1 / (k + rank)) across all lists where the item appears.
 * k = 60 is a standard smoothing constant.
 */
function reciprocalRankFusion(
  ...lists: Array<Array<{ id: number; rank: number }>>
): Array<{ id: number; score: number }> {
  const K = 60;
  const scores = new Map<number, number>();

  for (const list of lists) {
    for (const item of list) {
      const current = scores.get(item.id) ?? 0;
      scores.set(item.id, current + 1 / (K + item.rank));
    }
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Check if metadata matches all filter criteria.
 */
function matchesFilter(
  metadata: Record<string, any>,
  filter: Record<string, any>
): boolean {
  for (const [key, value] of Object.entries(filter)) {
    if (metadata[key] !== value) return false;
  }
  return true;
}

/**
 * Infer document type from file name/path.
 */
function inferType(source: string): string {
  const ext = extname(source).toLowerCase();
  switch (ext) {
    case ".md":
    case ".mdx":
      return "markdown";
    case ".pdf":
      return "pdf";
    case ".html":
    case ".htm":
      return "url";
    case ".txt":
    default:
      return "text";
  }
}

/**
 * Safely parse JSON, returning empty object on failure.
 */
function safeJsonParse(str: string): Record<string, any> {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

/**
 * Sanitize a query string for FTS5 MATCH.
 * Wraps individual words in quotes to avoid FTS5 syntax errors.
 */
function sanitizeFtsQuery(query: string): string {
  const words = query
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return "";
  // Join words with OR for broader matching
  return words.map((w) => `"${w}"`).join(" OR ");
}
