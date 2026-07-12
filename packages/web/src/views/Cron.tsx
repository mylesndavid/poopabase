import React, { useEffect, useState } from "react";
import { api, type CronRec, type DB, type FunctionRec } from "../api";
import { Button, Icon, cx, fmtAgo, fmtTime } from "../ui";

const PRESETS = [
  { label: "Every 10s", value: "*/10 * * * * *" },
  { label: "Every minute", value: "* * * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Daily 9am", value: "0 9 * * *" },
];

export function CronView({ db }: { db: DB }) {
  const [crons, setCrons] = useState<CronRec[]>([]);
  const [fns, setFns] = useState<FunctionRec[]>([]);
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("*/10 * * * * *");
  const [fnId, setFnId] = useState("");

  const load = async () => {
    const [c, f] = await Promise.all([api.crons(db.id), api.functions(db.id)]);
    setCrons(c);
    setFns(f);
    if (!fnId && f.length) setFnId(f[0].id);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [db.id]);

  const create = async () => {
    if (!name.trim() || !fnId) return;
    await api.createCron(db.id, name.trim(), schedule, fnId);
    setName("");
    await load();
  };

  const fnName = (id: string) => fns.find((f) => f.id === id)?.name ?? id;

  return (
    <div className="space-y-5 p-6">
      <div className="rounded-md border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 text-[13px] font-semibold">Schedule a job</div>
        {fns.length === 0 ? (
          <p className="text-[12px] text-subtle">Create a function first — cron jobs invoke functions on a schedule.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-subtle">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="nightly-rollup"
                className="w-40 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-subtle">Function</label>
              <select
                value={fnId}
                onChange={(e) => setFnId(e.target.value)}
                className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
              >
                {fns.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-subtle">Schedule (cron)</label>
              <input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                className="w-44 rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-accent"
              />
            </div>
            <Button variant="primary" size="md" onClick={create}>
              <Icon name="plus" className="h-3.5 w-3.5" /> Add
            </Button>
            <div className="flex gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setSchedule(p.value)}
                  className={cx(
                    "rounded-md border px-2 py-1 text-[11px]",
                    schedule === p.value ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-muted hover:text-text"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-surface shadow-card">
        <div className="border-b border-border px-4 py-3 text-[13px] font-semibold">Scheduled jobs</div>
        <div className="divide-y divide-border">
          {crons.map((c) => (
            <div key={c.id} className="flex items-center gap-4 px-4 py-3">
              <button
                onClick={async () => {
                  await api.toggleCron(c.id);
                  load();
                }}
                className={cx(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  c.enabled ? "bg-accent" : "bg-border"
                )}
              >
                <span
                  className={cx(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                    c.enabled ? "left-[18px]" : "left-0.5"
                  )}
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  {c.name}
                  <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted">
                    {c.schedule}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-subtle">
                  <Icon name="fn" className="h-3 w-3 text-accent" /> {fnName(c.function_id)}
                </div>
              </div>
              <div className="text-right text-[11px] text-subtle">
                <div>last: {c.last_run ? fmtAgo(c.last_run) : "—"}</div>
                <div>next: {c.next_run ? fmtTime(c.next_run) : "—"}</div>
              </div>
              <button
                onClick={async () => {
                  await api.deleteCron(c.id);
                  load();
                }}
                className="text-subtle hover:text-bad"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          ))}
          {crons.length === 0 && <div className="px-4 py-8 text-center text-[12px] text-subtle">No jobs scheduled.</div>}
        </div>
      </div>
    </div>
  );
}
