import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type DB } from "../api";
import { Button, Icon, cx } from "../ui";

interface Column {
  name: string;
  type: string;
  pk: boolean;
  notnull: boolean;
}

interface Filter {
  col: string;
  op: string;
  val: string;
}

const PAGE_SIZE = 100;
const OPS = ["=", "!=", ">", "<", ">=", "<=", "LIKE", "IS NULL", "IS NOT NULL"];

function qid(id: string) {
  return `"${id.replace(/"/g, '""')}"`;
}

function pgType(t: string): string {
  const u = (t || "").toUpperCase();
  if (u.includes("INT")) return "int8";
  if (u.includes("REAL") || u.includes("FLOA") || u.includes("DOUB")) return "float8";
  if (u.includes("BOOL")) return "bool";
  if (u.includes("CHAR") || u.includes("TEXT") || u.includes("CLOB")) return "text";
  if (u.includes("BLOB")) return "bytea";
  if (u.includes("DATE") || u.includes("TIME")) return "timestamptz";
  return t ? t.toLowerCase() : "any";
}

export function TablesView({
  db,
  table,
  onChanged,
  onPick,
  tables,
}: {
  db: DB;
  table: string | null;
  onChanged: () => void;
  onPick: (name: string) => void;
  tables: { name: string; rows: number }[];
}) {
  const [schema, setSchema] = useState<Column[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [rids, setRids] = useState<(number | null)[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ col: string; dir: "ASC" | "DESC" } | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [inserting, setInserting] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Reset view state when switching tables.
  useEffect(() => {
    setPage(0);
    setSearch("");
    setSort(null);
    setFilters([]);
    setSelected(new Set());
  }, [table]);

  // Load column schema for the active table.
  useEffect(() => {
    if (!table) return;
    api.query(db.id, `PRAGMA table_info(${qid(table)})`).then((res) => {
      const s: Column[] = (res.rows || []).map((r) => ({
        name: String(r[1]),
        type: String(r[2] || ""),
        notnull: Number(r[3]) === 1,
        pk: Number(r[5]) > 0,
      }));
      setSchema(s);
    });
  }, [db.id, table]);

  const buildWhere = useCallback((): { clause: string; params: unknown[] } => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (search.trim()) {
      const textCols = schema.filter((c) => pgType(c.type) === "text" || c.type === "");
      const target = textCols.length ? textCols : schema;
      const ors = target.map((c) => `${qid(c.name)} LIKE ?`);
      if (ors.length) {
        parts.push(`(${ors.join(" OR ")})`);
        for (const _ of target) params.push(`%${search.trim()}%`);
      }
    }
    for (const f of filters) {
      if (f.op === "IS NULL" || f.op === "IS NOT NULL") {
        parts.push(`${qid(f.col)} ${f.op}`);
      } else {
        parts.push(`${qid(f.col)} ${f.op} ?`);
        params.push(f.op === "LIKE" ? f.val : coerce(f.val));
      }
    }
    return { clause: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", params };
  }, [search, filters, schema]);

  const load = useCallback(async () => {
    if (!table) return;
    setLoading(true);
    setError(null);
    const { clause, params } = buildWhere();
    const order = sort ? ` ORDER BY ${qid(sort.col)} ${sort.dir}` : "";
    const sql = `SELECT rowid AS __rid, * FROM ${qid(table)}${clause}${order} LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`;
    const res = await api.query(db.id, sql, params);
    if (!res.ok) {
      setError(res.error || "query failed");
      setRows([]);
      setCols([]);
      setLoading(false);
      return;
    }
    const allCols = res.columns || [];
    setCols(allCols.slice(1));
    setRids((res.rows || []).map((r) => (r[0] == null ? null : Number(r[0]))));
    setRows((res.rows || []).map((r) => r.slice(1)));
    const countRes = await api.query(db.id, `SELECT COUNT(*) FROM ${qid(table)}${clause}`, params);
    setTotal(Number(countRes.rows?.[0]?.[0] ?? 0));
    setSelected(new Set());
    setLoading(false);
  }, [db.id, table, schema, sort, page, buildWhere]);

  useEffect(() => {
    load();
  }, [load]);

  const onSearchChange = (v: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(0);
      setSearch(v);
    }, 250);
  };

  const deleteSelected = async () => {
    const rid = schema.length ? true : false;
    if (!rid) return;
    const ids = [...selected].map((i) => rids[i]).filter((x): x is number => x != null);
    if (!ids.length) return;
    await api.query(db.id, `DELETE FROM ${qid(table!)} WHERE rowid IN (${ids.map(() => "?").join(",")})`, ids);
    onChanged();
    load();
  };

  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);
  const pkCols = useMemo(() => new Set(schema.filter((c) => c.pk).map((c) => c.name)), [schema]);

  if (!table) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-subtle">
        {tables.length ? "Select a table from the sidebar." : "No tables yet — create one in the SQL Editor."}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Button variant="primary" size="sm" onClick={() => setInserting(true)}>
            <Icon name="plus" className="h-3.5 w-3.5" /> Insert
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <div className="relative">
            <ToolButton active={filters.length > 0} onClick={() => { setShowFilter((s) => !s); setShowSort(false); }} icon="filter">
              Filter {filters.length > 0 && <span className="text-greenink">· {filters.length}</span>}
            </ToolButton>
            {showFilter && (
              <FilterPopover
                schema={schema}
                filters={filters}
                onClose={() => setShowFilter(false)}
                onChange={(f) => { setFilters(f); setPage(0); }}
              />
            )}
          </div>
          <div className="relative">
            <ToolButton active={!!sort} onClick={() => { setShowSort((s) => !s); setShowFilter(false); }} icon="sort">
              Sort {sort && <span className="text-greenink">· {sort.col} {sort.dir === "ASC" ? "↑" : "↓"}</span>}
            </ToolButton>
            {showSort && (
              <SortPopover
                schema={schema}
                sort={sort}
                onClose={() => setShowSort(false)}
                onChange={(s) => { setSort(s); setPage(0); }}
              />
            )}
          </div>
          {selected.size > 0 && (
            <>
              <div className="mx-1 h-4 w-px bg-border" />
              <Button variant="danger" size="sm" onClick={deleteSelected}>
                <Icon name="trash" className="h-3.5 w-3.5" /> Delete {selected.size}
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border border-border bg-bg px-2.5 py-1">
            <Icon name="search" className="h-3.5 w-3.5 text-subtle" />
            <input
              defaultValue={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search rows"
              className="w-44 bg-transparent text-[12px] text-text outline-none placeholder:text-subtle"
            />
          </div>
          <button onClick={load} title="Refresh" className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted hover:bg-elevated hover:text-text">
            <Icon name="refresh" className={cx("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
          <div className="flex items-center gap-1 text-[12px] text-muted">
            <span className="tabular-nums">{from}–{to} of {total}</span>
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted hover:bg-elevated disabled:opacity-30"
            >
              <Icon name="chevron" className="h-3.5 w-3.5 rotate-90" />
            </button>
            <button
              disabled={to >= total}
              onClick={() => setPage((p) => p + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted hover:bg-elevated disabled:opacity-30"
            >
              <Icon name="chevron" className="h-3.5 w-3.5 -rotate-90" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <div className="m-4 rounded-md border border-bad/30 bg-bad/5 px-4 py-3 font-mono text-[12px] text-bad">{error}</div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="sticky top-0 z-10 w-10 border-b border-r border-border bg-elevated px-0 py-0">
                  <div className="flex h-9 items-center justify-center">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && selected.size === rows.length}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(rows.map((_, i) => i)) : new Set())
                      }
                      className="h-3.5 w-3.5 accent-[#3ecf8e]"
                    />
                  </div>
                </th>
                {cols.map((c) => {
                  const meta = schema.find((s) => s.name === c);
                  return (
                    <th key={c} className="sticky top-0 z-10 border-b border-r border-border bg-elevated px-3 py-0 text-left font-normal">
                      <div className="flex h-9 items-center gap-1.5">
                        {pkCols.has(c) && <Icon name="key" className="h-3 w-3 text-warn" />}
                        <span className="font-medium text-text">{c}</span>
                        <span className="font-mono text-[11px] text-subtle">{pgType(meta?.type || "")}</span>
                      </div>
                    </th>
                  );
                })}
                <th className="sticky top-0 z-10 border-b border-border bg-elevated" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={cx("group", selected.has(i) ? "bg-brandwash" : "hover:bg-elevated/60")}>
                  <td className="w-10 border-b border-r border-border/70 px-0 text-center">
                    <div className="flex h-8 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(i);
                          else next.delete(i);
                          setSelected(next);
                        }}
                        className="h-3.5 w-3.5 accent-[#3ecf8e] opacity-0 group-hover:opacity-100 checked:opacity-100"
                      />
                    </div>
                  </td>
                  {row.map((cell, j) => (
                    <td key={j} className="max-w-[360px] truncate border-b border-r border-border/70 px-3 py-2 font-mono text-[12px] text-text">
                      {cell === null ? (
                        <span className="rounded bg-elevated px-1.5 py-0.5 text-[11px] text-subtle">NULL</span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  ))}
                  <td className="border-b border-border/70" />
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={cols.length + 2} className="px-4 py-10 text-center text-[13px] text-subtle">
                    {search || filters.length ? "No rows match." : "Empty table."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-4 py-1.5 text-[11px] text-muted">
        <span className="font-mono">{qid(table)}</span>
        <span className="flex items-center gap-3">
          <span>{total} rows</span>
          <span>{cols.length} columns</span>
          <span className="flex items-center gap-1.5 text-greenink">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-greenink" /> replicated
          </span>
        </span>
      </div>

      {inserting && (
        <InsertModal
          schema={schema}
          onClose={() => setInserting(false)}
          onSubmit={async (values) => {
            const entries = Object.entries(values).filter(([, v]) => v !== "");
            const colNames = entries.map(([k]) => qid(k)).join(", ");
            const placeholders = entries.map(() => "?").join(", ");
            const params = entries.map(([, v]) => coerce(v));
            const res = await api.query(
              db.id,
              `INSERT INTO ${qid(table)} (${colNames}) VALUES (${placeholders})`,
              params
            );
            if (!res.ok) return res.error || "insert failed";
            setInserting(false);
            onChanged();
            load();
            return null;
          }}
        />
      )}
    </div>
  );
}

function coerce(v: string): unknown {
  if (v === "") return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d*\.\d+$/.test(v)) return Number(v);
  return v;
}

function ToolButton({
  children,
  onClick,
  icon,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors",
        active ? "border-[#cfeede] bg-brandwash text-greenink" : "border-transparent text-muted hover:bg-elevated hover:text-text"
      )}
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function FilterPopover({
  schema,
  filters,
  onClose,
  onChange,
}: {
  schema: Column[];
  filters: Filter[];
  onClose: () => void;
  onChange: (f: Filter[]) => void;
}) {
  const [draft, setDraft] = useState<Filter[]>(filters.length ? filters : []);
  const add = () => setDraft([...draft, { col: schema[0]?.name || "", op: "=", val: "" }]);
  const apply = () => {
    onChange(draft.filter((f) => f.col));
    onClose();
  };
  return (
    <Popover onClose={onClose} width="w-[420px]">
      <div className="mb-2 text-[12px] font-medium text-text">Filters</div>
      <div className="space-y-2">
        {draft.length === 0 && <div className="text-[12px] text-subtle">No filters. Rows are unfiltered.</div>}
        {draft.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select
              value={f.col}
              onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, col: e.target.value } : x)))}
              className="flex-1 rounded-md border border-border bg-bg px-2 py-1 text-[12px]"
            >
              {schema.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
            <select
              value={f.op}
              onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))}
              className="rounded-md border border-border bg-bg px-2 py-1 font-mono text-[12px]"
            >
              {OPS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            {f.op !== "IS NULL" && f.op !== "IS NOT NULL" && (
              <input
                value={f.val}
                onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, val: e.target.value } : x)))}
                placeholder="value"
                className="w-24 rounded-md border border-border bg-bg px-2 py-1 text-[12px]"
              />
            )}
            <button onClick={() => setDraft(draft.filter((_, j) => j !== i))} className="text-subtle hover:text-bad">
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={add} className="inline-flex items-center gap-1 text-[12px] text-greenink hover:underline">
          <Icon name="plus" className="h-3.5 w-3.5" /> Add filter
        </button>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => { onChange([]); onClose(); }}>Clear</Button>
          <Button size="sm" variant="primary" onClick={apply}>Apply</Button>
        </div>
      </div>
    </Popover>
  );
}

function SortPopover({
  schema,
  sort,
  onClose,
  onChange,
}: {
  schema: Column[];
  sort: { col: string; dir: "ASC" | "DESC" } | null;
  onClose: () => void;
  onChange: (s: { col: string; dir: "ASC" | "DESC" } | null) => void;
}) {
  return (
    <Popover onClose={onClose} width="w-64">
      <div className="mb-2 text-[12px] font-medium text-text">Sort by</div>
      <div className="space-y-1">
        {schema.map((c) => (
          <div key={c.name} className="flex items-center gap-1">
            <button
              onClick={() => onChange({ col: c.name, dir: sort?.col === c.name && sort.dir === "ASC" ? "DESC" : "ASC" })}
              className={cx(
                "flex flex-1 items-center justify-between rounded-md px-2 py-1 text-left text-[12px]",
                sort?.col === c.name ? "bg-brandwash text-greenink" : "hover:bg-elevated"
              )}
            >
              <span>{c.name}</span>
              {sort?.col === c.name && <span>{sort.dir === "ASC" ? "↑ asc" : "↓ desc"}</span>}
            </button>
          </div>
        ))}
      </div>
      {sort && (
        <button onClick={() => { onChange(null); onClose(); }} className="mt-2 text-[12px] text-muted hover:text-text">
          Clear sort
        </button>
      )}
    </Popover>
  );
}

function Popover({ children, onClose, width }: { children: React.ReactNode; onClose: () => void; width: string }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className={cx("absolute left-0 top-9 z-40 rounded-xl border border-borderhi bg-overlay p-3 shadow-pop", width)}>
        {children}
      </div>
    </>
  );
}

function InsertModal({
  schema,
  onClose,
  onSubmit,
}: {
  schema: Column[];
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<string | null>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const e = await onSubmit(values);
    setBusy(false);
    if (e) setErr(e);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1114]/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-[460px] max-w-[92vw] rounded-2xl border border-borderhi bg-surface shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border px-5 py-4 text-[15px] font-semibold">Insert row</div>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
          {schema.map((c) => (
            <div key={c.name}>
              <label className="mb-1 flex items-center gap-1.5 text-[12px] text-muted">
                {c.pk && <Icon name="key" className="h-3 w-3 text-warn" />}
                <span className="font-medium text-text">{c.name}</span>
                <span className="font-mono text-[11px] text-subtle">{pgType(c.type)}</span>
                {c.pk && <span className="text-subtle">· auto</span>}
              </label>
              <input
                value={values[c.name] ?? ""}
                onChange={(e) => setValues({ ...values, [c.name]: e.target.value })}
                placeholder={c.pk ? "auto (leave blank)" : c.notnull ? "required" : "NULL"}
                className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-[12px] text-text outline-none focus:border-accent"
              />
            </div>
          ))}
          {err && <div className="rounded-md border border-bad/30 bg-bad/5 px-3 py-2 font-mono text-[12px] text-bad">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="default" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={busy}>Insert row</Button>
        </div>
      </div>
    </div>
  );
}
