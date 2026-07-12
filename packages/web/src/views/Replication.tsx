import React, { useEffect, useRef, useState } from "react";
import { api, type DB, type Replication as Rep } from "../api";
import { Button, Icon, Stat, cx, fmtBytes, fmtTime } from "../ui";

export function Replication({ db, onChanged }: { db: DB; onChanged: () => void }) {
  const [rep, setRep] = useState<Rep | null>(null);
  const [bucket, setBucket] = useState<{ key: string; size: number }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);
  const prevSegs = useRef(0);

  const load = async () => {
    const [r, b] = await Promise.all([api.replication(db.id), api.bucket(db.id)]);
    if (r.segments.length !== prevSegs.current) {
      prevSegs.current = r.segments.length;
      setPulse((p) => p + 1);
    }
    setRep(r);
    setBucket(b);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [db.id]);

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    await fn();
    await load();
    onChanged();
    setBusy(null);
  };

  const stats = rep?.stats;
  const isWarm = db.status === "warm";

  return (
    <div className="space-y-5 p-6">
      {/* Stream diagram */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-surface to-bg p-6">
        <div className="flex items-center justify-between gap-6">
          {/* Live SQLite */}
          <Node
            icon="db"
            title={db.name}
            subtitle={isWarm ? "warm · in memory" : "hibernated"}
            tone={isWarm ? "warm" : "cold"}
          />

          {/* Stream */}
          <div className="relative flex-1">
            <div className="relative h-px w-full bg-gradient-to-r from-accent/10 via-accent/40 to-accent/10">
              {isWarm && (
                <div
                  key={pulse}
                  className="absolute -top-[3px] left-0 h-1.5 w-16 rounded-full bg-accent2 shadow-glow animate-flow"
                />
              )}
            </div>
            <div className="mt-2 text-center text-[11px] font-medium text-accent2">
              {isWarm ? "streaming WAL →" : "sync paused"}
            </div>
            <div className="mt-0.5 text-center font-mono text-[10px] text-subtle">
              {stats?.walSegments ?? 0} segments · {fmtBytes(stats?.walBytes ?? 0)}
            </div>
          </div>

          {/* Bucket */}
          <Node
            icon="snapshot"
            title={stats?.bucket.kind === "local" ? "local bucket" : stats?.bucket.kind ?? "bucket"}
            subtitle={`${fmtBytes(stats?.totalBytes ?? 0)} stored`}
            tone="accent"
          />
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          <Button size="sm" disabled={!isWarm || busy !== null} onClick={() => act("sync", () => api.sync(db.id))}>
            <Icon name="bolt" className="h-3.5 w-3.5" /> {busy === "sync" ? "Syncing…" : "Sync now"}
          </Button>
          {isWarm ? (
            <Button size="sm" disabled={busy !== null} onClick={() => act("hib", () => api.hibernate(db.id))}>
              <Icon name="moon" className="h-3.5 w-3.5" /> {busy === "hib" ? "Hibernating…" : "Hibernate to bucket"}
            </Button>
          ) : (
            <Button variant="primary" size="sm" disabled={busy !== null} onClick={() => act("wake", () => api.wake(db.id))}>
              <Icon name="sun" className="h-3.5 w-3.5" /> {busy === "wake" ? "Waking…" : "Wake from bucket"}
            </Button>
          )}
        </div>
        <p className="mt-3 text-center text-[11px] text-subtle">
          {isWarm
            ? "Every write streams to the bucket. Hibernate drops the warm copy — you only pay for storage."
            : "Database is hibernated. A query (or Wake) rehydrates it from the bucket in milliseconds."}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 divide-x divide-border rounded-xl border border-border bg-surface">
        <Stat label="Generations" value={stats?.generations ?? 0} />
        <Stat label="WAL segments" value={stats?.walSegments ?? 0} sub={fmtBytes(stats?.walBytes ?? 0)} />
        <Stat label="Snapshots" value={rep?.segments.filter((s) => s.kind === "snapshot").length ?? 0} sub={fmtBytes(stats?.snapshotBytes ?? 0)} />
        <Stat label="In bucket" value={fmtBytes(stats?.totalBytes ?? 0)} sub={`${bucket.length} objects`} />
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Generations */}
        <div className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-4 py-3 text-[13px] font-semibold">Generations & segments</div>
          <div className="max-h-[340px] space-y-3 overflow-y-auto p-4">
            {rep?.generations.map((g, gi) => {
              const segs = rep.segments.filter((s) => s.generation === g.id);
              return (
                <div key={g.id} className="rounded-lg border border-border/70 bg-bg p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[12px] text-accent2">gen {gi + 1} · {g.id}</span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted">{g.reason}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {segs.map((s) => (
                      <div
                        key={s.id}
                        title={`${s.kind} · ${fmtBytes(s.size)} · ${fmtTime(s.created_at)}`}
                        className={cx(
                          "flex items-center gap-1 rounded-md border px-1.5 py-1 font-mono text-[10px]",
                          s.kind === "snapshot"
                            ? "border-accent/30 bg-accent/10 text-accent2"
                            : "border-border bg-elevated text-muted"
                        )}
                      >
                        <Icon name={s.kind === "snapshot" ? "snapshot" : "stream"} className="h-3 w-3" />
                        {s.kind === "snapshot" ? "base" : `wal ${s.idx}`}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bucket objects */}
        <div className="rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-[13px] font-semibold">Bucket objects</span>
            <span className="font-mono text-[10px] text-subtle">{stats?.bucket.kind}://</span>
          </div>
          <div className="max-h-[340px] overflow-y-auto p-2">
            {bucket.map((o) => (
              <div key={o.key} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-elevated/50">
                <span className="truncate font-mono text-[11px] text-muted">{o.key.replace(`dbs/${db.id}/`, "")}</span>
                <span className="ml-2 shrink-0 font-mono text-[10px] text-subtle">{fmtBytes(o.size)}</span>
              </div>
            ))}
            {bucket.length === 0 && <div className="px-2 py-6 text-center text-[12px] text-subtle">Empty.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Node({
  icon,
  title,
  subtitle,
  tone,
}: {
  icon: string;
  title: string;
  subtitle: string;
  tone: "warm" | "cold" | "accent";
}) {
  const ring = tone === "warm" ? "border-good/40 shadow-[0_0_30px_rgba(76,195,138,0.15)]" : tone === "accent" ? "border-accent/40 shadow-glow" : "border-border";
  return (
    <div className="flex w-40 shrink-0 flex-col items-center gap-2">
      <div className={cx("flex h-16 w-16 items-center justify-center rounded-2xl border bg-elevated", ring)}>
        <Icon name={icon} className={cx("h-7 w-7", tone === "cold" ? "text-subtle" : tone === "warm" ? "text-good" : "text-accent2")} />
      </div>
      <div className="text-center">
        <div className="truncate text-[13px] font-medium">{title}</div>
        <div className="text-[11px] text-subtle">{subtitle}</div>
      </div>
    </div>
  );
}
