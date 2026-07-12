import React, { useEffect, useState } from "react";
import { api, type DB, type FunctionRec, type RunRec } from "../api";
import { Button, Icon, cx, fmtAgo } from "../ui";

const STARTER = `// 'db.query()' runs SQL against this database.
// 'input' is the invocation payload. Return JSON.
const rows = db.query("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'");
console.log("tables:", rows[0].n);
return { tables: rows[0].n, ok: true };`;

export function FunctionsView({ db }: { db: DB }) {
  const [fns, setFns] = useState<FunctionRec[]>([]);
  const [active, setActive] = useState<FunctionRec | null>(null);
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [output, setOutput] = useState<any>(null);
  const [runs, setRuns] = useState<RunRec[]>([]);

  const load = async () => {
    const [f, r] = await Promise.all([api.functions(db.id), api.runs(db.id)]);
    setFns(f);
    setRuns(r);
    if (!active && f.length) {
      setActive(f[0]);
      setCode(f[0].code);
    }
  };

  useEffect(() => {
    load();
  }, [db.id]);

  const select = (f: FunctionRec) => {
    setActive(f);
    setCode(f.code);
    setOutput(null);
  };

  const create = async () => {
    if (!newName.trim()) return;
    const f = await api.createFunction(db.id, newName.trim(), STARTER);
    setCreating(false);
    setNewName("");
    await load();
    select(f);
  };

  const save = async () => {
    if (!active) return;
    await api.updateFunction(active.id, code);
    await load();
  };

  const invoke = async () => {
    if (!active) return;
    await api.updateFunction(active.id, code);
    const res = await api.invoke(active.id, {});
    setOutput(res);
    await load();
  };

  return (
    <div className="flex h-full">
      <div className="w-56 shrink-0 border-r border-border p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] uppercase tracking-wider text-subtle">Functions</span>
          <button onClick={() => setCreating(true)} className="text-muted hover:text-text">
            <Icon name="plus" className="h-3.5 w-3.5" />
          </button>
        </div>
        {creating && (
          <div className="mb-2 flex gap-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="name"
              className="w-full rounded-md border border-border bg-surface px-2 py-1 text-[12px] outline-none focus:border-accent"
            />
          </div>
        )}
        <div className="space-y-0.5">
          {fns.map((f) => (
            <button
              key={f.id}
              onClick={() => select(f)}
              className={cx(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px]",
                active?.id === f.id ? "bg-elevated text-text" : "text-muted hover:bg-elevated/50"
              )}
            >
              <Icon name="fn" className="h-3.5 w-3.5 text-accent2" /> {f.name}
            </button>
          ))}
          {fns.length === 0 && !creating && (
            <div className="px-2 py-4 text-[12px] text-subtle">No functions yet.</div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="font-mono text-[13px]">{active.name}</span>
              <div className="flex gap-2">
                <Button size="sm" onClick={save}>
                  Save
                </Button>
                <Button variant="primary" size="sm" onClick={invoke}>
                  <Icon name="play" className="h-3 w-3" /> Invoke
                </Button>
              </div>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="h-56 w-full resize-none border-b border-border bg-bg p-4 font-mono text-[13px] leading-relaxed text-text outline-none"
            />
            <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border">
              <div className="overflow-y-auto p-4">
                <div className="mb-2 text-[11px] uppercase tracking-wider text-subtle">Last result</div>
                {output ? (
                  <div className="space-y-2">
                    <div className={cx("text-[12px]", output.status === "success" ? "text-good" : "text-bad")}>
                      {output.status} · {output.durationMs} ms
                    </div>
                    {output.logs?.length > 0 && (
                      <pre className="rounded-lg border border-border bg-surface p-2 font-mono text-[11px] text-muted">
                        {output.logs.join("\n")}
                      </pre>
                    )}
                    <pre className="rounded-lg border border-border bg-surface p-2 font-mono text-[11px] text-text">
                      {JSON.stringify(output.result ?? output.error, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="text-[12px] text-subtle">Invoke to see output.</div>
                )}
              </div>
              <div className="overflow-y-auto p-4">
                <div className="mb-2 text-[11px] uppercase tracking-wider text-subtle">Run history</div>
                <div className="space-y-1">
                  {runs
                    .filter((r) => r.function_id === active.id)
                    .map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-md border border-border/60 px-2.5 py-1.5 text-[12px]">
                        <span className="flex items-center gap-2">
                          <span className={cx("h-1.5 w-1.5 rounded-full", r.status === "success" ? "bg-good" : "bg-bad")} />
                          <span className="text-muted">{r.trigger}</span>
                        </span>
                        <span className="font-mono text-[10px] text-subtle">
                          {r.duration_ms}ms · {fmtAgo(r.started_at)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13px] text-subtle">
            Create a function to run server-side logic against your database.
          </div>
        )}
      </div>
    </div>
  );
}
