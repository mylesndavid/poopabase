import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import type { Manager } from "./lib/manager.js";

export function registerRoutes(app: FastifyInstance, manager: Manager) {
  const store = manager.store;

  // ---- databases ----
  app.get("/api/databases", async () => {
    return store.listDatabases().map((d) => enrich(manager, d.id));
  });

  app.post("/api/databases", async (req) => {
    const body = req.body as { name?: string; region?: string };
    const name = (body?.name || "untitled").trim();
    const rec = await manager.createDatabase(name, body?.region || "local-1");
    return enrich(manager, rec.id);
  });

  app.get("/api/databases/:id", async (req) => {
    const { id } = req.params as { id: string };
    return enrich(manager, id);
  });

  app.delete("/api/databases/:id", async (req) => {
    const { id } = req.params as { id: string };
    await manager.deleteDatabase(id);
    return { ok: true };
  });

  app.post("/api/databases/:id/query", async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as { sql: string; params?: unknown[] };
    try {
      const res = await manager.query(id, body.sql, body.params || []);
      return { ok: true, ...res };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  app.get("/api/databases/:id/tables", async (req) => {
    const { id } = req.params as { id: string };
    return manager.listTables(id);
  });

  // ---- replication / streaming ----
  app.get("/api/databases/:id/replication", async (req) => {
    const { id } = req.params as { id: string };
    const generations = store.listGenerations(id);
    const segments = store.listSegments(id);
    const walBytes = segments.filter((s) => s.kind === "wal").reduce((a, s) => a + s.size, 0);
    const snapBytes = segments.filter((s) => s.kind === "snapshot").reduce((a, s) => a + s.size, 0);
    return {
      generations,
      segments,
      stats: {
        generations: generations.length,
        segments: segments.length,
        walSegments: segments.filter((s) => s.kind === "wal").length,
        walBytes,
        snapshotBytes: snapBytes,
        totalBytes: walBytes + snapBytes,
        bucket: { kind: manager.bucket.kind, location: manager.bucket.location },
      },
    };
  });

  app.get("/api/databases/:id/bucket", async (req) => {
    const { id } = req.params as { id: string };
    return manager.bucket.list(`dbs/${id}`);
  });

  app.post("/api/databases/:id/sync", async (req) => {
    const { id } = req.params as { id: string };
    const seg = await manager.sync(id);
    return { ok: true, segment: seg };
  });

  app.post("/api/databases/:id/hibernate", async (req) => {
    const { id } = req.params as { id: string };
    await manager.hibernate(id);
    return enrich(manager, id);
  });

  app.post("/api/databases/:id/wake", async (req) => {
    const { id } = req.params as { id: string };
    const res = await manager.wake(id);
    return { ...enrich(manager, id), wake: res };
  });

  app.get("/api/databases/:id/restore-points", async (req) => {
    const { id } = req.params as { id: string };
    return store
      .listSegments(id)
      .map((s) => ({ at: s.created_at, kind: s.kind, generation: s.generation, idx: s.idx, size: s.size }));
  });

  app.post("/api/databases/:id/restore-preview", async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as { timestamp: number };
    const preview = await manager.restorePreview(id, body.timestamp);
    const results: Record<string, unknown> = {};
    return { tables: preview.tables, ...results };
  });

  // ---- functions ----
  app.get("/api/databases/:id/functions", async (req) => {
    const { id } = req.params as { id: string };
    return store.listFunctions(id);
  });

  app.post("/api/databases/:id/functions", async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name: string; code: string };
    const now = Date.now();
    const rec = {
      id: `fn_${nanoid(10)}`,
      db_id: id,
      name: body.name,
      code: body.code,
      created_at: now,
      updated_at: now,
    };
    store.insertFunction(rec);
    return rec;
  });

  app.put("/api/functions/:fid", async (req) => {
    const { fid } = req.params as { fid: string };
    const body = req.body as { code: string };
    store.updateFunction(fid, body.code);
    return store.getFunction(fid);
  });

  app.delete("/api/functions/:fid", async (req) => {
    const { fid } = req.params as { fid: string };
    store.deleteFunction(fid);
    return { ok: true };
  });

  app.post("/api/functions/:fid/invoke", async (req) => {
    const { fid } = req.params as { fid: string };
    const body = (req.body as { input?: unknown }) || {};
    return manager.invokeFunction(fid, "manual", body.input ?? null);
  });

  // ---- crons ----
  app.get("/api/databases/:id/crons", async (req) => {
    const { id } = req.params as { id: string };
    return store.listCrons(id);
  });

  app.post("/api/databases/:id/crons", async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name: string; schedule: string; function_id: string };
    const rec = {
      id: `cron_${nanoid(10)}`,
      db_id: id,
      name: body.name,
      schedule: body.schedule,
      function_id: body.function_id,
      enabled: 1,
      created_at: Date.now(),
      last_run: null,
      next_run: null,
    };
    store.insertCron(rec);
    manager.scheduleCron(rec.id);
    return store.getCron(rec.id);
  });

  app.post("/api/crons/:cid/toggle", async (req) => {
    const { cid } = req.params as { cid: string };
    const rec = store.getCron(cid);
    if (!rec) return { ok: false };
    const enabled = rec.enabled ? 0 : 1;
    store.updateCron(cid, { enabled });
    if (enabled) manager.scheduleCron(cid);
    else manager.unscheduleCron(cid);
    return store.getCron(cid);
  });

  app.delete("/api/crons/:cid", async (req) => {
    const { cid } = req.params as { cid: string };
    manager.unscheduleCron(cid);
    store.deleteCron(cid);
    return { ok: true };
  });

  // ---- runs ----
  app.get("/api/databases/:id/runs", async (req) => {
    const { id } = req.params as { id: string };
    return store.listRuns(id);
  });
}

function enrich(manager: Manager, id: string) {
  const rec = manager.store.getDatabase(id);
  if (!rec) return null;
  const segments = manager.store.listSegments(id);
  const walBytes = segments.filter((s) => s.kind === "wal").reduce((a, s) => a + s.size, 0);
  const snapBytes = segments.filter((s) => s.kind === "snapshot").reduce((a, s) => a + s.size, 0);
  return {
    ...rec,
    replication: {
      generations: manager.store.listGenerations(id).length,
      segments: segments.length,
      bytes: walBytes + snapBytes,
    },
    functions: manager.store.listFunctions(id).length,
    crons: manager.store.listCrons(id).length,
    connectionString: `poopabase://local-1/${rec.id}`,
    connect: pgConnectionInfo(rec.name),
  };
}

function pgConnectionInfo(dbName: string) {
  const host = process.env.PGWIRE_HOST || "localhost";
  const port = Number(process.env.PGWIRE_PORT || 5432);
  const user = process.env.PGWIRE_USER || "poopabase";
  return {
    host,
    port,
    user,
    database: dbName,
    poolMode: "transaction",
    ssl: false,
    uri: `postgresql://${user}@${host}:${port}/${dbName}`,
  };
}
