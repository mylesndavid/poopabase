import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Control-plane store. This is poopabase's own metadata database (a SQLite file,
 * naturally) that tracks every hosted database, its replication generations,
 * functions, cron jobs and run history.
 */
export interface DatabaseRecord {
  id: string;
  name: string;
  created_at: number;
  status: "warm" | "hibernated";
  region: string;
  last_active: number;
  generation: string | null;
  table_count: number;
}

export interface GenerationRecord {
  id: string;
  db_id: string;
  created_at: number;
  reason: string;
}

export interface SegmentRecord {
  id: number;
  db_id: string;
  generation: string;
  idx: number;
  kind: "snapshot" | "wal";
  key: string;
  size: number;
  offset: number;
  created_at: number;
}

export interface FunctionRecord {
  id: string;
  db_id: string;
  name: string;
  code: string;
  created_at: number;
  updated_at: number;
}

export interface CronRecord {
  id: string;
  db_id: string;
  name: string;
  schedule: string;
  function_id: string;
  enabled: number;
  created_at: number;
  last_run: number | null;
  next_run: number | null;
}

export interface RunRecord {
  id: string;
  db_id: string;
  function_id: string;
  trigger: string;
  status: "success" | "error";
  started_at: number;
  duration_ms: number;
  logs: string;
  result: string | null;
  error: string | null;
}

export class ControlStore {
  db: Database.Database;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, "control.db"));
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate() {
    // Additive column migrations (ignored if already present).
    try {
      this.db.exec(`ALTER TABLE databases ADD COLUMN table_count INTEGER NOT NULL DEFAULT 0`);
    } catch {
      /* column already exists */
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS databases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'warm',
        region TEXT NOT NULL DEFAULT 'local-1',
        last_active INTEGER NOT NULL,
        generation TEXT,
        table_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS generations (
        id TEXT PRIMARY KEY,
        db_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        reason TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        db_id TEXT NOT NULL,
        generation TEXT NOT NULL,
        idx INTEGER NOT NULL,
        kind TEXT NOT NULL,
        key TEXT NOT NULL,
        size INTEGER NOT NULL,
        offset INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS functions (
        id TEXT PRIMARY KEY,
        db_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS crons (
        id TEXT PRIMARY KEY,
        db_id TEXT NOT NULL,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        function_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_run INTEGER,
        next_run INTEGER
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        db_id TEXT NOT NULL,
        function_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        logs TEXT NOT NULL DEFAULT '',
        result TEXT,
        error TEXT
      );
    `);
  }

  // ---- databases ----
  listDatabases(): DatabaseRecord[] {
    return this.db.prepare(`SELECT * FROM databases ORDER BY created_at DESC`).all() as DatabaseRecord[];
  }
  getDatabase(id: string): DatabaseRecord | undefined {
    return this.db.prepare(`SELECT * FROM databases WHERE id = ?`).get(id) as DatabaseRecord | undefined;
  }
  insertDatabase(rec: DatabaseRecord) {
    this.db
      .prepare(
        `INSERT INTO databases (id,name,created_at,status,region,last_active,generation,table_count) VALUES (@id,@name,@created_at,@status,@region,@last_active,@generation,@table_count)`
      )
      .run(rec);
  }
  updateDatabase(id: string, patch: Partial<DatabaseRecord>) {
    const current = this.getDatabase(id);
    if (!current) return;
    const merged = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE databases SET name=@name,status=@status,region=@region,last_active=@last_active,generation=@generation,table_count=@table_count WHERE id=@id`
      )
      .run(merged);
  }
  deleteDatabase(id: string) {
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM databases WHERE id=?`).run(id);
      this.db.prepare(`DELETE FROM generations WHERE db_id=?`).run(id);
      this.db.prepare(`DELETE FROM segments WHERE db_id=?`).run(id);
      this.db.prepare(`DELETE FROM functions WHERE db_id=?`).run(id);
      this.db.prepare(`DELETE FROM crons WHERE db_id=?`).run(id);
      this.db.prepare(`DELETE FROM runs WHERE db_id=?`).run(id);
    });
    tx();
  }

  // ---- generations + segments ----
  insertGeneration(rec: GenerationRecord) {
    this.db
      .prepare(`INSERT INTO generations (id,db_id,created_at,reason) VALUES (@id,@db_id,@created_at,@reason)`)
      .run(rec);
  }
  listGenerations(dbId: string): GenerationRecord[] {
    return this.db
      .prepare(`SELECT * FROM generations WHERE db_id=? ORDER BY created_at ASC`)
      .all(dbId) as GenerationRecord[];
  }
  insertSegment(rec: Omit<SegmentRecord, "id">): number {
    const info = this.db
      .prepare(
        `INSERT INTO segments (db_id,generation,idx,kind,key,size,offset,created_at) VALUES (@db_id,@generation,@idx,@kind,@key,@size,@offset,@created_at)`
      )
      .run(rec);
    return Number(info.lastInsertRowid);
  }
  listSegments(dbId: string, generation?: string): SegmentRecord[] {
    if (generation) {
      return this.db
        .prepare(`SELECT * FROM segments WHERE db_id=? AND generation=? ORDER BY idx ASC`)
        .all(dbId, generation) as SegmentRecord[];
    }
    return this.db
      .prepare(`SELECT * FROM segments WHERE db_id=? ORDER BY created_at ASC`)
      .all(dbId) as SegmentRecord[];
  }
  lastSegment(dbId: string, generation: string): SegmentRecord | undefined {
    return this.db
      .prepare(`SELECT * FROM segments WHERE db_id=? AND generation=? ORDER BY idx DESC LIMIT 1`)
      .get(dbId, generation) as SegmentRecord | undefined;
  }

  // ---- functions ----
  listFunctions(dbId: string): FunctionRecord[] {
    return this.db
      .prepare(`SELECT * FROM functions WHERE db_id=? ORDER BY created_at ASC`)
      .all(dbId) as FunctionRecord[];
  }
  getFunction(id: string): FunctionRecord | undefined {
    return this.db.prepare(`SELECT * FROM functions WHERE id=?`).get(id) as FunctionRecord | undefined;
  }
  insertFunction(rec: FunctionRecord) {
    this.db
      .prepare(
        `INSERT INTO functions (id,db_id,name,code,created_at,updated_at) VALUES (@id,@db_id,@name,@code,@created_at,@updated_at)`
      )
      .run(rec);
  }
  updateFunction(id: string, code: string) {
    this.db.prepare(`UPDATE functions SET code=?, updated_at=? WHERE id=?`).run(code, Date.now(), id);
  }
  deleteFunction(id: string) {
    this.db.prepare(`DELETE FROM functions WHERE id=?`).run(id);
    this.db.prepare(`DELETE FROM crons WHERE function_id=?`).run(id);
  }

  // ---- crons ----
  listCrons(dbId?: string): CronRecord[] {
    if (dbId) return this.db.prepare(`SELECT * FROM crons WHERE db_id=? ORDER BY created_at ASC`).all(dbId) as CronRecord[];
    return this.db.prepare(`SELECT * FROM crons ORDER BY created_at ASC`).all() as CronRecord[];
  }
  getCron(id: string): CronRecord | undefined {
    return this.db.prepare(`SELECT * FROM crons WHERE id=?`).get(id) as CronRecord | undefined;
  }
  insertCron(rec: CronRecord) {
    this.db
      .prepare(
        `INSERT INTO crons (id,db_id,name,schedule,function_id,enabled,created_at,last_run,next_run) VALUES (@id,@db_id,@name,@schedule,@function_id,@enabled,@created_at,@last_run,@next_run)`
      )
      .run(rec);
  }
  updateCron(id: string, patch: Partial<CronRecord>) {
    const current = this.getCron(id);
    if (!current) return;
    const merged = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE crons SET name=@name,schedule=@schedule,enabled=@enabled,last_run=@last_run,next_run=@next_run WHERE id=@id`
      )
      .run(merged);
  }
  deleteCron(id: string) {
    this.db.prepare(`DELETE FROM crons WHERE id=?`).run(id);
  }

  // ---- runs ----
  insertRun(rec: RunRecord) {
    this.db
      .prepare(
        `INSERT INTO runs (id,db_id,function_id,trigger,status,started_at,duration_ms,logs,result,error) VALUES (@id,@db_id,@function_id,@trigger,@status,@started_at,@duration_ms,@logs,@result,@error)`
      )
      .run(rec);
  }
  listRuns(dbId: string, limit = 50): RunRecord[] {
    return this.db
      .prepare(`SELECT * FROM runs WHERE db_id=? ORDER BY started_at DESC LIMIT ?`)
      .all(dbId, limit) as RunRecord[];
  }
}
