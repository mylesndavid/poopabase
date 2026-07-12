import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { StorageBackend } from "./storage.js";
import type { ControlStore, SegmentRecord } from "./store.js";

/**
 * Litestream-style continuous replication for SQLite.
 *
 * The model mirrors Litestream's primitives exactly:
 *   - generation : a replication lineage, opened with a full base *snapshot*
 *   - WAL segment: the bytes appended to the -wal file since the last sync
 *
 * Because we disable SQLite auto-checkpointing (PRAGMA wal_autocheckpoint=0),
 * the -wal file only grows as transactions commit. Each `sync()` ships the new
 * tail of the -wal to the bucket as an ordered segment. A restore is then just:
 *   base snapshot .db  +  concatenated WAL segments  ->  replay  ->  checkpoint.
 *
 * Point-in-time recovery falls out for free: replay only the segments whose
 * timestamp is <= the target.
 */
export interface RestoreOptions {
  generation?: string;
  /** Restore state as of this epoch-ms timestamp (inclusive). */
  timestamp?: number;
  /** Destination .db path. */
  dest: string;
}

export class Replicator {
  constructor(
    private store: ControlStore,
    private bucket: StorageBackend,
    private liveDir: string
  ) {}

  livePath(dbId: string): string {
    return path.join(this.liveDir, `${dbId}.db`);
  }
  private walPath(dbId: string): string {
    return `${this.livePath(dbId)}-wal`;
  }

  /** Open (or create) a generation by taking a fresh full snapshot. */
  async startGeneration(dbId: string, reason: string, handle?: Database.Database): Promise<string> {
    // Force everything into the main db file and reset the WAL.
    if (handle) handle.pragma("wal_checkpoint(TRUNCATE)");

    const gen = nanoid(12);
    const now = Date.now();
    this.store.insertGeneration({ id: gen, db_id: dbId, created_at: now, reason });

    const dbBytes = fs.readFileSync(this.livePath(dbId));
    const key = `dbs/${dbId}/generations/${gen}/snapshot.db`;
    await this.bucket.put(key, dbBytes);
    this.store.insertSegment({
      db_id: dbId,
      generation: gen,
      idx: 0,
      kind: "snapshot",
      key,
      size: dbBytes.length,
      offset: 0,
      created_at: now,
    });

    this.store.updateDatabase(dbId, { generation: gen, last_active: now });
    return gen;
  }

  /**
   * Ship the tail of the -wal to the bucket. Returns the segment that was
   * created, or null if there was nothing new to replicate.
   */
  async sync(dbId: string, handle?: Database.Database): Promise<SegmentRecord | null> {
    const rec = this.store.getDatabase(dbId);
    if (!rec) throw new Error(`unknown database ${dbId}`);
    let gen = rec.generation;
    if (!gen) {
      gen = await this.startGeneration(dbId, "initial", handle);
      return this.store.lastSegment(dbId, gen) ?? null;
    }

    const walFile = this.walPath(dbId);
    const walSize = fs.existsSync(walFile) ? fs.statSync(walFile).size : 0;

    const segments = this.store.listSegments(dbId, gen);
    const walSegments = segments.filter((s) => s.kind === "wal");
    const shipped = walSegments.reduce((acc, s) => acc + s.size, 0);

    if (walSize < shipped) {
      // The -wal shrank: a checkpoint truncated it. Start a fresh generation.
      const newGen = await this.startGeneration(dbId, "checkpoint", handle);
      return this.store.lastSegment(dbId, newGen) ?? null;
    }
    if (walSize === shipped) {
      this.store.updateDatabase(dbId, { last_active: Date.now() });
      return null; // nothing new
    }

    const fd = fs.openSync(walFile, "r");
    const length = walSize - shipped;
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, shipped);
    fs.closeSync(fd);

    const idx = (this.store.lastSegment(dbId, gen)?.idx ?? 0) + 1;
    const now = Date.now();
    const key = `dbs/${dbId}/generations/${gen}/wal/${String(idx).padStart(8, "0")}.wal`;
    await this.bucket.put(key, buf);
    const id = this.store.insertSegment({
      db_id: dbId,
      generation: gen,
      idx,
      kind: "wal",
      key,
      size: length,
      offset: shipped,
      created_at: now,
    });
    this.store.updateDatabase(dbId, { last_active: now });
    return { id, db_id: dbId, generation: gen, idx, kind: "wal", key, size: length, offset: shipped, created_at: now };
  }

  /**
   * Rebuild a database file from the bucket: base snapshot + WAL segments,
   * replayed and checkpointed into a standalone .db file.
   */
  async restore(dbId: string, opts: RestoreOptions): Promise<{ generation: string; segments: number }> {
    const generations = this.store.listGenerations(dbId);
    if (generations.length === 0) throw new Error(`no generations for ${dbId}`);

    // Pick the newest generation at or before the target timestamp.
    let chosen = opts.generation
      ? generations.find((g) => g.id === opts.generation)
      : [...generations].reverse().find((g) => !opts.timestamp || g.created_at <= opts.timestamp);
    if (!chosen) chosen = generations[0];

    const segs = this.store
      .listSegments(dbId, chosen.id)
      .filter((s) => !opts.timestamp || s.created_at <= opts.timestamp);
    const snapshot = segs.find((s) => s.kind === "snapshot");
    if (!snapshot) throw new Error(`no snapshot in generation ${chosen.id}`);

    const walSegs = segs.filter((s) => s.kind === "wal").sort((a, b) => a.idx - b.idx);

    // Write the base snapshot.
    fs.mkdirSync(path.dirname(opts.dest), { recursive: true });
    const snapBytes = await this.bucket.get(snapshot.key);
    fs.writeFileSync(opts.dest, snapBytes);

    const destWal = `${opts.dest}-wal`;
    if (fs.existsSync(destWal)) fs.rmSync(destWal);
    const destShm = `${opts.dest}-shm`;
    if (fs.existsSync(destShm)) fs.rmSync(destShm);

    // Concatenate WAL segments to reconstruct the -wal, then let SQLite replay.
    if (walSegs.length > 0) {
      const parts: Buffer[] = [];
      for (const s of walSegs) parts.push(await this.bucket.get(s.key));
      fs.writeFileSync(destWal, Buffer.concat(parts));
    }

    const handle = new Database(opts.dest);
    handle.pragma("journal_mode = WAL");
    handle.pragma("wal_checkpoint(TRUNCATE)");
    handle.close();
    if (fs.existsSync(destWal)) fs.rmSync(destWal);

    return { generation: chosen.id, segments: walSegs.length };
  }
}
