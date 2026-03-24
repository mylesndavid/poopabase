import type { Client } from "@libsql/client";
import type { Memory } from "./types.js";

export class MemoryManager {
  constructor(private client: Client) {}

  /**
   * Store a raw observation.
   */
  async observe(
    content: string,
    metadata?: Record<string, any>
  ): Promise<Memory> {
    const meta = metadata ?? {};
    const now = new Date().toISOString();

    const result = await this.client.execute({
      sql: `INSERT INTO poop_memories (type, content, importance, metadata, created_at, accessed_at, access_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: ["observation", content, 0.5, JSON.stringify(meta), now, now, 0],
    });

    return {
      id: Number(result.lastInsertRowid),
      type: "observation",
      content,
      importance: 0.5,
      metadata: meta,
      createdAt: now,
      accessedAt: now,
      accessCount: 0,
    };
  }

  /**
   * Recall memories relevant to a query using FTS5 BM25 search.
   * Updates access timestamps and counts for retrieved memories.
   */
  async recall(query: string, limit: number = 10): Promise<Memory[]> {
    const ftsQuery = sanitizeFtsQuery(query);
    if (!ftsQuery) return [];

    const result = await this.client.execute({
      sql: `SELECT m.id, m.type, m.content, m.importance, m.metadata,
                   m.created_at, m.accessed_at, m.access_count
            FROM poop_memories_fts fts
            JOIN poop_memories m ON fts.rowid = m.id
            WHERE poop_memories_fts MATCH ?
              AND m.compacted = 0
            ORDER BY fts.rank
            LIMIT ?`,
      args: [ftsQuery, limit],
    });

    const memories = result.rows.map(rowToMemory);

    // Update access timestamps and counts
    const now = new Date().toISOString();
    for (const mem of memories) {
      await this.client.execute({
        sql: `UPDATE poop_memories
              SET accessed_at = ?, access_count = access_count + 1
              WHERE id = ?`,
        args: [now, mem.id],
      });
    }

    return memories;
  }

  /**
   * Compact observations into durable memories.
   *
   * Strategy:
   * 1. Get all non-compacted observations
   * 2. For each observation, find similar ones via FTS
   * 3. If 3+ are similar, merge them into a "memory" type
   * 4. Mark originals as compacted
   */
  async compact(): Promise<{
    memoriesCreated: number;
    observationsPruned: number;
  }> {
    // Get all non-compacted observations
    const observations = await this.client.execute(
      `SELECT id, content, metadata FROM poop_memories
       WHERE type = 'observation' AND compacted = 0
       ORDER BY created_at ASC`
    );

    if (observations.rows.length < 3) {
      return { memoriesCreated: 0, observationsPruned: 0 };
    }

    const processed = new Set<number>();
    let memoriesCreated = 0;
    let observationsPruned = 0;

    for (const obs of observations.rows) {
      const obsId = obs.id as number;
      if (processed.has(obsId)) continue;

      const content = obs.content as string;
      const ftsQuery = sanitizeFtsQuery(content);
      if (!ftsQuery) continue;

      // Find similar observations
      const similar = await this.client.execute({
        sql: `SELECT m.id, m.content
              FROM poop_memories_fts fts
              JOIN poop_memories m ON fts.rowid = m.id
              WHERE poop_memories_fts MATCH ?
                AND m.type = 'observation'
                AND m.compacted = 0
                AND m.id != ?
              ORDER BY fts.rank
              LIMIT 10`,
        args: [ftsQuery, obsId],
      });

      // Collect this observation + its similar ones
      const cluster: Array<{ id: number; content: string }> = [
        { id: obsId, content },
      ];

      for (const sim of similar.rows) {
        const simId = sim.id as number;
        if (!processed.has(simId)) {
          cluster.push({ id: simId, content: sim.content as string });
        }
      }

      // Need at least 3 similar observations to form a memory
      if (cluster.length >= 3) {
        // Create a merged memory by concatenating observations
        const mergedContent = cluster
          .map((c) => c.content)
          .join("\n---\n");

        const summary = `[Compacted from ${cluster.length} observations] ${mergedContent}`;
        const now = new Date().toISOString();

        // Calculate importance based on cluster size (more observations = more important)
        const importance = Math.min(0.9, 0.5 + cluster.length * 0.05);

        await this.client.execute({
          sql: `INSERT INTO poop_memories (type, content, importance, metadata, created_at, accessed_at, access_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            "memory",
            summary,
            importance,
            JSON.stringify({
              source_observations: cluster.map((c) => c.id),
              compacted_count: cluster.length,
            }),
            now,
            now,
            0,
          ],
        });

        memoriesCreated++;

        // Mark originals as compacted
        for (const c of cluster) {
          await this.client.execute({
            sql: "UPDATE poop_memories SET compacted = 1 WHERE id = ?",
            args: [c.id],
          });
          processed.add(c.id);
          observationsPruned++;
        }
      } else {
        // Mark as processed so we don't try again this round
        processed.add(obsId);
      }
    }

    return { memoriesCreated, observationsPruned };
  }

  /**
   * List memories, optionally filtered by type.
   */
  async list(options?: {
    type?: string;
    limit?: number;
  }): Promise<Memory[]> {
    const limit = options?.limit ?? 100;
    let sql = `SELECT id, type, content, importance, metadata, created_at, accessed_at, access_count
               FROM poop_memories WHERE compacted = 0`;
    const args: any[] = [];

    if (options?.type) {
      sql += " AND type = ?";
      args.push(options.type);
    }

    sql += " ORDER BY created_at DESC LIMIT ?";
    args.push(limit);

    const result = await this.client.execute({ sql, args });
    return result.rows.map(rowToMemory);
  }

  /**
   * Delete a specific memory.
   */
  async forget(memoryId: number): Promise<void> {
    // Manually remove from FTS before deleting
    const mem = await this.client.execute({
      sql: "SELECT content FROM poop_memories WHERE id = ?",
      args: [memoryId],
    });

    if (mem.rows.length > 0) {
      await this.client.execute({
        sql: "INSERT INTO poop_memories_fts(poop_memories_fts, rowid, content) VALUES('delete', ?, ?)",
        args: [memoryId, mem.rows[0].content],
      });
    }

    await this.client.execute({
      sql: "DELETE FROM poop_memories WHERE id = ?",
      args: [memoryId],
    });
  }

  /**
   * Get memory statistics.
   */
  async stats(): Promise<{
    observations: number;
    memories: number;
    facts: number;
  }> {
    const result = await this.client.execute(
      `SELECT type, COUNT(*) as count FROM poop_memories
       WHERE compacted = 0
       GROUP BY type`
    );

    const stats = { observations: 0, memories: 0, facts: 0 };
    for (const row of result.rows) {
      const type = row.type as string;
      const count = row.count as number;
      if (type === "observation") stats.observations = count;
      else if (type === "memory") stats.memories = count;
      else if (type === "fact") stats.facts = count;
    }

    return stats;
  }
}

function rowToMemory(row: Record<string, any>): Memory {
  return {
    id: row.id as number,
    type: row.type as string,
    content: row.content as string,
    importance: row.importance as number,
    metadata: safeJsonParse(row.metadata as string),
    createdAt: row.created_at as string,
    accessedAt: row.accessed_at as string,
    accessCount: row.access_count as number,
  };
}

function safeJsonParse(str: string): Record<string, any> {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

function sanitizeFtsQuery(query: string): string {
  const words = query
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return "";
  return words.map((w) => `"${w}"`).join(" OR ");
}
