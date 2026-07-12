import React, { useEffect, useState } from "react";
import { api, type DB, type RunRec } from "../api";
import { Badge, Button, Icon, cx, fmtAgo, fmtBytes } from "../ui";

export function Overview({
  db,
  onGo,
  onChanged,
}: {
  db: DB;
  onGo: (t: any) => void;
  onChanged: () => void;
}) {
  const [tables, setTables] = useState<{ name: string; rows: number }[]>([]);
  const [runs, setRuns] = useState<RunRec[]>([]);

  useEffect(() => {
    api.tables(db.id).then(setTables).catch(() => {});
    api.runs(db.id).then(setRuns).catch(() => {});
  }, [db.id, db.last_active]);

  const totalRows = tables.reduce((a, t) => a + t.rows, 0);
  const snippet = `import { connect } from "@poopabase/client";

const db = connect("${db.connectionString}");
const { rows } = await db.query("SELECT * FROM users");`;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="grid grid-cols-4 gap-3">
        <Metric icon="table" label="Tables" value={tables.length} onClick={() => onGo("tables")} />
        <Metric icon="db" label="Rows" value={totalRows} />
        <Metric
          icon="stream"
          label="Streamed"
          value={fmtBytes(db.replication.bytes)}
          sub={`${db.replication.segments} segments`}
          onClick={() => onGo("replication")}
        />
        <Metric icon="fn" label="Functions" value={db.functions} sub={`${db.crons} cron`} onClick={() => onGo("functions")} />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-5">
          <div className="rounded-md border border-border bg-surface p-5 shadow-card">
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-[15px]">💩</div>
              <div>
                <div className="text-[14px] font-semibold">{db.name}</div>
                <div className="font-mono text-[11px] text-subtle">{db.id}</div>
              </div>
              <div className="ml-auto">
                <Badge tone={db.status === "warm" ? "warm" : "cold"}>{db.status === "warm" ? "Warm" : "Hibernated"}</Badge>
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              A SQLite database that streams every write to durable cloud storage. Query it like a local file, hibernate it
              to near-zero cost, and rehydrate in milliseconds — with point-in-time recovery baked in.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="primary" size="sm" onClick={() => onGo("sql")}>
                <Icon name="sql" className="h-3.5 w-3.5" /> Open SQL editor
              </Button>
              <Button size="sm" onClick={() => onGo("replication")}>
                <Icon name="stream" className="h-3.5 w-3.5" /> View streaming
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-[13px] font-semibold">Connect</span>
              <button
                onClick={() => navigator.clipboard.writeText(snippet)}
                className="flex items-center gap-1 text-[11px] text-muted hover:text-text"
              >
                <Icon name="copy" className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-muted">{snippet}</pre>
          </div>
        </div>

        <div className="rounded-md border border-border bg-surface shadow-card">
          <div className="border-b border-border px-4 py-3 text-[13px] font-semibold">Recent activity</div>
          <div className="max-h-[360px] space-y-1 overflow-y-auto p-3">
            {runs.slice(0, 20).map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]">
                <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", r.status === "success" ? "bg-good" : "bg-bad")} />
                <span className="flex-1 truncate text-muted">
                  fn invoked <span className="text-subtle">({r.trigger})</span>
                </span>
                <span className="font-mono text-[10px] text-subtle">{fmtAgo(r.started_at)}</span>
              </div>
            ))}
            {runs.length === 0 && <div className="px-2 py-6 text-center text-[12px] text-subtle">No activity yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex flex-col gap-2 rounded-md border border-border bg-surface p-4 text-left shadow-card transition-colors",
        onClick && "hover:border-borderhi hover:bg-elevated/40"
      )}
    >
      <Icon name={icon} className="h-4 w-4 text-accent" />
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-subtle">
        {label}
        {sub && <span> · {sub}</span>}
      </div>
    </button>
  );
}
