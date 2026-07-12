import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { Cron } from "croner";
import { LocalBucket, type StorageBackend } from "./storage.js";
import { ControlStore, type DatabaseRecord } from "./store.js";
import { Replicator } from "./replicator.js";
import { runFunction } from "./functions.js";

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowsAffected: number;
  durationMs: number;
}

/**
 * The Manager is poopabase's data plane orchestrator: it owns the warm SQLite
 * handles, drives replication, executes SQL/functions, and runs cron jobs.
 */
export class Manager {
  store: ControlStore;
  bucket: StorageBackend;
  replicator: Replicator;
  private liveDir: string;
  private handles = new Map<string, Database.Database>();
  private crons = new Map<string, Cron>();
  private autoSyncTimer?: NodeJS.Timeout;

  constructor(dataDir: string) {
    const liveDir = path.join(dataDir, "live");
    const bucketDir = path.join(dataDir, "bucket");
    fs.mkdirSync(liveDir, { recursive: true });
    this.liveDir = liveDir;
    this.store = new ControlStore(dataDir);
    this.bucket = new LocalBucket(bucketDir);
    this.replicator = new Replicator(this.store, this.bucket, liveDir);
  }

  async start() {
    // Reschedule all enabled cron jobs on boot.
    for (const cron of this.store.listCrons()) {
      if (cron.enabled) this.scheduleCron(cron.id);
    }
    // Continuous replication tick — ships WAL tails for all warm databases.
    this.autoSyncTimer = setInterval(() => {
      for (const [id] of this.handles) {
        this.replicator.sync(id, this.handles.get(id)).catch(() => {});
      }
    }, 2000);
  }

  async stop() {
    if (this.autoSyncTimer) clearInterval(this.autoSyncTimer);
    for (const c of this.crons.values()) c.stop();
    for (const h of this.handles.values()) h.close();
  }

  private open(dbId: string): Database.Database {
    let handle = this.handles.get(dbId);
    if (!handle) {
      const p = this.replicator.livePath(dbId);
      handle = new Database(p);
      handle.pragma("journal_mode = WAL");
      handle.pragma("wal_autocheckpoint = 0"); // Litestream owns checkpoints
      this.handles.set(dbId, handle);
    }
    return handle;
  }

  private async ensureWarm(dbId: string): Promise<Database.Database> {
    const rec = this.store.getDatabase(dbId);
    if (!rec) throw new Error("database not found");
    if (rec.status === "hibernated") await this.wake(dbId);
    return this.open(dbId);
  }

  // ---- lifecycle ----
  async createDatabase(name: string, region = "local-1"): Promise<DatabaseRecord> {
    const id = `pb_${nanoid(10)}`;
    const now = Date.now();
    const rec: DatabaseRecord = {
      id,
      name,
      created_at: now,
      status: "warm",
      region,
      last_active: now,
      generation: null,
    };
    this.store.insertDatabase(rec);
    const handle = this.open(id);
    handle.exec("CREATE TABLE IF NOT EXISTS _poopabase (k TEXT PRIMARY KEY, v TEXT);");
    handle.exec("DROP TABLE IF EXISTS _poopabase;");
    await this.replicator.startGeneration(id, "initial", handle);
    return this.store.getDatabase(id)!;
  }

  async query(dbId: string, sql: string, params: unknown[] = []): Promise<QueryResult> {
    const handle = await this.ensureWarm(dbId);
    const started = Date.now();
    const trimmed = sql.trim();
    const stmt = handle.prepare(trimmed);
    let columns: string[] = [];
    let rows: unknown[][] = [];
    let rowsAffected = 0;
    if (stmt.reader) {
      const objs = stmt.raw().all(...(params as any[])) as unknown[][];
      columns = stmt.columns().map((c) => c.name);
      rows = objs;
    } else {
      const info = stmt.run(...(params as any[]));
      rowsAffected = info.changes;
    }
    const durationMs = Date.now() - started;
    // Opportunistic replication of the write path.
    if (!stmt.reader) this.replicator.sync(dbId, handle).catch(() => {});
    this.store.updateDatabase(dbId, { last_active: Date.now() });
    return { columns, rows, rowsAffected, durationMs };
  }

  async listTables(dbId: string): Promise<{ name: string; rows: number }[]> {
    const handle = await this.ensureWarm(dbId);
    const tables = handle
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all() as { name: string }[];
    return tables.map((t) => {
      const count = handle.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get() as { c: number };
      return { name: t.name, rows: count.c };
    });
  }

  async sync(dbId: string) {
    const handle = this.handles.get(dbId);
    return this.replicator.sync(dbId, handle);
  }

  async hibernate(dbId: string) {
    const handle = this.handles.get(dbId);
    if (handle) {
      await this.replicator.sync(dbId, handle);
      handle.pragma("wal_checkpoint(TRUNCATE)");
      await this.replicator.sync(dbId, handle);
      handle.close();
      this.handles.delete(dbId);
    }
    const live = this.replicator.livePath(dbId);
    for (const suffix of ["", "-wal", "-shm"]) {
      const f = live + suffix;
      if (fs.existsSync(f)) fs.rmSync(f);
    }
    this.store.updateDatabase(dbId, { status: "hibernated" });
  }

  async wake(dbId: string): Promise<{ generation: string; segments: number; coldStartMs: number }> {
    const started = Date.now();
    const existing = this.handles.get(dbId);
    if (existing) {
      existing.close();
      this.handles.delete(dbId);
    }
    const res = await this.replicator.restore(dbId, { dest: this.replicator.livePath(dbId) });
    this.store.updateDatabase(dbId, { status: "warm", last_active: Date.now() });
    // Re-open and open a fresh generation for the resurrected db.
    const handle = this.open(dbId);
    await this.replicator.startGeneration(dbId, "wake", handle);
    return { ...res, coldStartMs: Date.now() - started };
  }

  async restorePreview(dbId: string, timestamp: number): Promise<QueryResult & { tables: string[] }> {
    const dest = path.join(this.liveDir, `_preview_${dbId}.db`);
    await this.replicator.restore(dbId, { dest, timestamp });
    const handle = new Database(dest, { readonly: false });
    const tables = (
      handle
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
        .all() as { name: string }[]
    ).map((t) => t.name);
    handle.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      const f = dest + suffix;
      if (fs.existsSync(f)) fs.rmSync(f);
    }
    return { columns: [], rows: [], rowsAffected: 0, durationMs: 0, tables };
  }

  async deleteDatabase(dbId: string) {
    const handle = this.handles.get(dbId);
    if (handle) {
      handle.close();
      this.handles.delete(dbId);
    }
    for (const c of this.store.listCrons(dbId)) this.unscheduleCron(c.id);
    const live = this.replicator.livePath(dbId);
    for (const suffix of ["", "-wal", "-shm"]) {
      const f = live + suffix;
      if (fs.existsSync(f)) fs.rmSync(f);
    }
    await this.bucket.delete(`dbs/${dbId}`);
    this.store.deleteDatabase(dbId);
  }

  // ---- functions ----
  async invokeFunction(functionId: string, trigger: string, input: unknown): Promise<any> {
    const fn = this.store.getFunction(functionId);
    if (!fn) throw new Error("function not found");
    const handle = await this.ensureWarm(fn.db_id);
    const runId = `run_${nanoid(10)}`;
    const started = Date.now();
    const logs: string[] = [];
    let status: "success" | "error" = "success";
    let result: unknown = null;
    let error: string | null = null;
    try {
      result = await runFunction(fn.code, {
        query: (sql: string, params: unknown[] = []) => {
          const stmt = handle.prepare(sql);
          if (stmt.reader) return stmt.all(...(params as any[]));
          const info = stmt.run(...(params as any[]));
          return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
        },
        log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
        input,
      });
      this.replicator.sync(fn.db_id, handle).catch(() => {});
    } catch (e) {
      status = "error";
      error = e instanceof Error ? e.message : String(e);
    }
    const durationMs = Date.now() - started;
    this.store.insertRun({
      id: runId,
      db_id: fn.db_id,
      function_id: functionId,
      trigger,
      status,
      started_at: started,
      duration_ms: durationMs,
      logs: logs.join("\n"),
      result: result != null ? JSON.stringify(result) : null,
      error,
    });
    return { runId, status, result, error, logs, durationMs };
  }

  // ---- cron ----
  scheduleCron(cronId: string) {
    const rec = this.store.getCron(cronId);
    if (!rec) return;
    this.unscheduleCron(cronId);
    const job = new Cron(rec.schedule, async () => {
      await this.invokeFunction(rec.function_id, "cron", { cronId });
      const next = job.nextRun();
      this.store.updateCron(cronId, {
        last_run: Date.now(),
        next_run: next ? next.getTime() : null,
      });
    });
    this.crons.set(cronId, job);
    const next = job.nextRun();
    this.store.updateCron(cronId, { next_run: next ? next.getTime() : null });
  }

  unscheduleCron(cronId: string) {
    const job = this.crons.get(cronId);
    if (job) {
      job.stop();
      this.crons.delete(cronId);
    }
  }
}
