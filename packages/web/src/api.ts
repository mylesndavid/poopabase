export interface DB {
  id: string;
  name: string;
  created_at: number;
  status: "warm" | "hibernated";
  region: string;
  last_active: number;
  generation: string | null;
  replication: { generations: number; segments: number; bytes: number };
  functions: number;
  crons: number;
  connectionString: string;
}

export interface Segment {
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

export interface Generation {
  id: string;
  db_id: string;
  created_at: number;
  reason: string;
}

export interface Replication {
  generations: Generation[];
  segments: Segment[];
  stats: {
    generations: number;
    segments: number;
    walSegments: number;
    walBytes: number;
    snapshotBytes: number;
    totalBytes: number;
    bucket: { kind: string; location: string };
  };
}

export interface QueryResult {
  ok: boolean;
  columns?: string[];
  rows?: unknown[][];
  rowsAffected?: number;
  durationMs?: number;
  error?: string;
}

export interface FunctionRec {
  id: string;
  db_id: string;
  name: string;
  code: string;
  created_at: number;
  updated_at: number;
}

export interface CronRec {
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

export interface RunRec {
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

async function j<T>(res: Response): Promise<T> {
  if (!res.ok && res.status >= 500) throw new Error(await res.text());
  return res.json();
}

export const api = {
  listDatabases: () => fetch("/api/databases").then((r) => j<DB[]>(r)),
  getDatabase: (id: string) => fetch(`/api/databases/${id}`).then((r) => j<DB>(r)),
  createDatabase: (name: string) =>
    fetch("/api/databases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).then((r) => j<DB>(r)),
  deleteDatabase: (id: string) => fetch(`/api/databases/${id}`, { method: "DELETE" }).then((r) => j(r)),
  query: (id: string, sql: string, params: unknown[] = []) =>
    fetch(`/api/databases/${id}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql, params }),
    }).then((r) => j<QueryResult>(r)),
  tables: (id: string) => fetch(`/api/databases/${id}/tables`).then((r) => j<{ name: string; rows: number }[]>(r)),
  replication: (id: string) => fetch(`/api/databases/${id}/replication`).then((r) => j<Replication>(r)),
  bucket: (id: string) => fetch(`/api/databases/${id}/bucket`).then((r) => j<{ key: string; size: number; lastModified: number }[]>(r)),
  sync: (id: string) => fetch(`/api/databases/${id}/sync`, { method: "POST" }).then((r) => j(r)),
  hibernate: (id: string) => fetch(`/api/databases/${id}/hibernate`, { method: "POST" }).then((r) => j<DB>(r)),
  wake: (id: string) => fetch(`/api/databases/${id}/wake`, { method: "POST" }).then((r) => j<DB & { wake: any }>(r)),
  restorePoints: (id: string) =>
    fetch(`/api/databases/${id}/restore-points`).then((r) => j<{ at: number; kind: string; generation: string; idx: number; size: number }[]>(r)),
  restorePreview: (id: string, timestamp: number) =>
    fetch(`/api/databases/${id}/restore-preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timestamp }),
    }).then((r) => j<{ tables: string[] }>(r)),
  functions: (id: string) => fetch(`/api/databases/${id}/functions`).then((r) => j<FunctionRec[]>(r)),
  createFunction: (id: string, name: string, code: string) =>
    fetch(`/api/databases/${id}/functions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, code }),
    }).then((r) => j<FunctionRec>(r)),
  updateFunction: (fid: string, code: string) =>
    fetch(`/api/functions/${fid}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    }).then((r) => j<FunctionRec>(r)),
  deleteFunction: (fid: string) => fetch(`/api/functions/${fid}`, { method: "DELETE" }).then((r) => j(r)),
  invoke: (fid: string, input: unknown) =>
    fetch(`/api/functions/${fid}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input }),
    }).then((r) => j<any>(r)),
  crons: (id: string) => fetch(`/api/databases/${id}/crons`).then((r) => j<CronRec[]>(r)),
  createCron: (id: string, name: string, schedule: string, function_id: string) =>
    fetch(`/api/databases/${id}/crons`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, schedule, function_id }),
    }).then((r) => j<CronRec>(r)),
  toggleCron: (cid: string) => fetch(`/api/crons/${cid}/toggle`, { method: "POST" }).then((r) => j<CronRec>(r)),
  deleteCron: (cid: string) => fetch(`/api/crons/${cid}`, { method: "DELETE" }).then((r) => j(r)),
  runs: (id: string) => fetch(`/api/databases/${id}/runs`).then((r) => j<RunRec[]>(r)),
};
