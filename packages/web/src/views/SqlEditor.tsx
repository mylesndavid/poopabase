import React, { useState } from "react";
import { api, type DB, type QueryResult } from "../api";
import { Button, Icon, Kbd, cx } from "../ui";

const SNIPPETS = [
  { label: "List tables", sql: "SELECT name FROM sqlite_master WHERE type='table';" },
  { label: "Create table", sql: "CREATE TABLE posts (\n  id INTEGER PRIMARY KEY,\n  title TEXT NOT NULL,\n  body TEXT,\n  created_at TEXT DEFAULT (datetime('now'))\n);" },
  { label: "Insert", sql: "INSERT INTO posts (title, body) VALUES ('Hello', 'poopabase is live');" },
];

export function SqlEditor({ db, onChanged }: { db: DB; onChanged: () => void }) {
  const [sql, setSql] = useState("SELECT name FROM sqlite_master WHERE type='table';");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    const res = await api.query(db.id, sql);
    setResult(res);
    setRunning(false);
    onChanged();
  };

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {SNIPPETS.map((s) => (
            <button
              key={s.label}
              onClick={() => setSql(s.sql)}
              className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-muted hover:border-borderhi hover:text-text"
            >
              {s.label}
            </button>
          ))}
        </div>
        <Button variant="primary" size="sm" onClick={run} disabled={running}>
          <Icon name="play" className="h-3 w-3" /> Run <Kbd>⌘↵</Kbd>
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
          }}
          spellCheck={false}
          className="h-44 w-full resize-none bg-transparent p-4 font-mono text-[13px] leading-relaxed text-text outline-none placeholder:text-subtle"
          placeholder="SELECT * FROM …"
        />
      </div>

      <div className="mt-4 min-h-0 flex-1">
        {result && (
          <div className="animate-slideUp">
            {result.ok ? (
              <>
                <div className="mb-2 flex items-center gap-3 text-[12px] text-muted">
                  <span className="flex items-center gap-1.5 text-good">
                    <Icon name="check" className="h-3.5 w-3.5" /> OK
                  </span>
                  {result.columns && result.columns.length > 0 ? (
                    <span>{result.rows?.length ?? 0} rows</span>
                  ) : (
                    <span>{result.rowsAffected} rows affected</span>
                  )}
                  <span className="text-subtle">· {result.durationMs} ms · replicated ✓</span>
                </div>
                {result.columns && result.columns.length > 0 && (
                  <ResultTable columns={result.columns} rows={result.rows || []} />
                )}
              </>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-[13px] text-bad">
                <Icon name="x" className="mt-0.5 h-4 w-4 shrink-0" />
                <code className="font-mono">{result.error}</code>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultTable({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  return (
    <div className="overflow-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-elevated">
            {columns.map((c) => (
              <th key={c} className="border-b border-border px-3 py-2 text-left font-medium text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={cx(i % 2 ? "bg-surface" : "bg-bg", "hover:bg-elevated/60")}>
              {row.map((cell, j) => (
                <td key={j} className="border-b border-border/50 px-3 py-2 font-mono text-[12px] text-text">
                  {cell === null ? <span className="text-subtle">NULL</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-[12px] text-subtle">
                No rows.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
