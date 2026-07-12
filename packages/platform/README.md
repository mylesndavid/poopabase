# @poopabase/platform

The hosted poopabase platform — a **Supabase-style control plane for SQLite**, with
Litestream-style continuous streaming to bucket storage.

Start a plain SQLite database, and poopabase streams every write to a bucket so it
survives, hibernates to near-zero cost when idle, and rehydrates in milliseconds.
Point-in-time recovery, server functions, and cron jobs come for free.

```bash
# from the repo root
npm install
npm run platform        # API on :4000, dashboard (dev) on :5180
```

Data lives under `.poopabase-data/` by default (`POOPABASE_DATA` to override):

```
.poopabase-data/
├── control.db     # control plane: databases, generations, functions, crons, runs
├── live/          # warm SQLite files (the "in-memory"/hot copies)
└── bucket/        # the storage backend — snapshots + WAL segments (S3/R2 in prod)
```

## The primitives

Everything is modeled directly on Litestream so the mental model carries over 1:1
when we swap the local bucket for S3/R2.

| Primitive | What it is | Code |
|-----------|------------|------|
| **StorageBackend** | The bucket. `put/get/list/delete`. `LocalBucket` today; `S3Bucket` drops in with no other changes. | `src/lib/storage.ts` |
| **Generation** | A replication lineage. Opens with a full base **snapshot** of the `.db` file. A checkpoint (or a wake) starts a new one. | `src/lib/replicator.ts` |
| **WAL segment** | The bytes appended to the `-wal` since the last sync, shipped to the bucket in order. Auto-checkpointing is off (`wal_autocheckpoint=0`) so poopabase owns checkpoints — exactly like Litestream. | `src/lib/replicator.ts` |
| **Restore** | `base snapshot + concatenated WAL segments → replay → checkpoint`. Filtering segments by timestamp gives **point-in-time recovery** for free. | `Replicator.restore()` |
| **Hibernate / Wake** | Hibernate syncs, checkpoints, and drops the warm copy (you only pay for storage). Wake rehydrates from the bucket. | `Manager.hibernate/wake` |
| **Function** | Server-side JS with a synchronous `db.query()` handle, captured `console`, and an `input`. Runs in a fresh V8 context. | `src/lib/functions.ts` |
| **Cron** | A schedule that invokes a function; run history is persisted. | `Manager.scheduleCron` |

## API (sketch)

```
GET    /api/databases
POST   /api/databases                 { name }
POST   /api/databases/:id/query       { sql, params }
GET    /api/databases/:id/tables
GET    /api/databases/:id/replication  # generations, segments, bucket stats
POST   /api/databases/:id/sync        # ship WAL tail now
POST   /api/databases/:id/hibernate
POST   /api/databases/:id/wake
POST   /api/databases/:id/restore-preview  { timestamp }   # PITR
POST   /api/databases/:id/functions   { name, code }
POST   /api/functions/:fid/invoke     { input }
POST   /api/databases/:id/crons       { name, schedule, function_id }
```

## Production notes

- **Storage**: implement `StorageBackend` against S3/R2 — nothing else changes.
- **Isolation**: functions run in a V8 context here; production hosting should move
  them to hardened isolates (workerd) or per-tenant sandboxes.
- **Wire protocol**: today the SDK talks JSON over HTTP; a Hrana-compatible endpoint
  would make `@libsql/client` a drop-in.
