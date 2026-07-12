import React, { useEffect, useState } from "react";
import { api, type DB } from "../api";
import { Icon, cx } from "../ui";

export function TablesView({ db }: { db: DB }) {
  const [tables, setTables] = useState<{ name: string; rows: number }[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [cols, setCols] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);

  useEffect(() => {
    api.tables(db.id).then((t) => {
      setTables(t);
      if (t.length && !active) select(t[0].name);
    });
  }, [db.id]);

  const select = async (name: string) => {
    setActive(name);
    const res = await api.query(db.id, `SELECT * FROM "${name}" LIMIT 200`);
    setCols(res.columns || []);
    setRows(res.rows || []);
  };

  return (
    <div className="flex h-full">
      <div className="w-56 shrink-0 border-r border-border bg-surface p-3">
        <div className="mb-2 px-1 text-[11px] uppercase tracking-wider text-subtle">Tables</div>
        <div className="space-y-0.5">
          {tables.map((t) => (
            <button
              key={t.name}
              onClick={() => select(t.name)}
              className={cx(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px]",
                active === t.name ? "bg-elevated text-text" : "text-muted hover:bg-elevated/50"
              )}
            >
              <span className="flex items-center gap-2">
                <Icon name="table" className="h-3.5 w-3.5 text-subtle" /> {t.name}
              </span>
              <span className="font-mono text-[11px] text-subtle">{t.rows}</span>
            </button>
          ))}
          {tables.length === 0 && <div className="px-2 py-4 text-[12px] text-subtle">No tables yet.</div>}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-auto p-6">
        {active && cols.length > 0 ? (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-elevated">
                {cols.map((c) => (
                  <th key={c} className="sticky top-0 border-b border-border bg-elevated px-3 py-2 text-left font-medium text-muted">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={cx(i % 2 ? "bg-surface" : "bg-bg", "hover:bg-elevated/60")}>
                  {row.map((cell, j) => (
                    <td key={j} className="border-b border-border/50 px-3 py-2 font-mono text-[12px]">
                      {cell === null ? <span className="text-subtle">NULL</span> : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-subtle">
            {active ? "Empty table." : "Select a table."}
          </div>
        )}
      </div>
    </div>
  );
}
