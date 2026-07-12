import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, type DB } from "./api";
import { Badge, Button, Icon, Kbd, LogoTile, Monogram, cx, fmtAgo } from "./ui";
import { Overview } from "./views/Overview";
import { SqlEditor } from "./views/SqlEditor";
import { TablesView } from "./views/Tables";
import { Replication } from "./views/Replication";
import { FunctionsView } from "./views/Functions";
import { CronView } from "./views/Cron";
import { CreateModal } from "./views/CreateModal";
import { ConnectDialog } from "./views/Connect";

type Tab = "overview" | "sql" | "tables" | "replication" | "functions" | "cron";
type Product = "home" | "sql" | "tables" | "database";

const PRODUCTS: { id: Product; label: string; icon: string; tab: Tab }[] = [
  { id: "home", label: "Home", icon: "home", tab: "overview" },
  { id: "sql", label: "SQL Editor", icon: "sql", tab: "sql" },
  { id: "tables", label: "Table Editor", icon: "table", tab: "tables" },
  { id: "database", label: "Database", icon: "stream", tab: "replication" },
];

const SUBNAV: Record<Product, { tab: Tab; label: string }[]> = {
  home: [{ tab: "overview", label: "Overview" }],
  sql: [{ tab: "sql", label: "New query" }],
  tables: [],
  database: [
    { tab: "replication", label: "Replication & Streams" },
    { tab: "functions", label: "Functions" },
    { tab: "cron", label: "Cron Jobs" },
  ],
};

const PRODUCT_OF: Record<Tab, Product> = {
  overview: "home",
  sql: "sql",
  tables: "tables",
  replication: "database",
  functions: "database",
  cron: "database",
};

const SECTION_LABEL: Record<Product, string> = {
  home: "Home",
  sql: "SQL Editor",
  tables: "Table Editor",
  database: "Database",
};

export function App() {
  const [dbs, setDbs] = useState<DB[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [creating, setCreating] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [tables, setTables] = useState<{ name: string; rows: number }[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await api.listDatabases();
    setDbs(list);
    setSelected((cur) => cur ?? list[0]?.id ?? null);
    return list;
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  // Load table list whenever the selected project changes.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    api.tables(selected).then((t) => {
      if (cancelled) return;
      setTables(t);
      setActiveTable((cur) => (cur && t.some((x) => x.name === cur) ? cur : t[0]?.name ?? null));
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const reloadTables = useCallback(() => {
    if (selected) api.tables(selected).then(setTables);
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette((s) => !s);
      }
      if (e.key === "Escape") {
        setShowPalette(false);
        setShowProjects(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = useMemo(() => dbs.find((d) => d.id === selected) ?? null, [dbs, selected]);
  const product = PRODUCT_OF[tab];

  const onCreate = async (name: string) => {
    const db = await api.createDatabase(name);
    await refresh();
    setSelected(db.id);
    setTab("sql");
    setCreating(false);
  };

  const pickTable = (name: string) => {
    setActiveTable(name);
    setTab("tables");
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-text">
      {/* Product rail */}
      <nav className="flex w-[3.25rem] shrink-0 flex-col items-center border-r border-border bg-surface py-3">
        <LogoTile className="mb-3 h-8 w-8" />
        <div className="flex flex-1 flex-col items-center gap-1">
          {PRODUCTS.map((p) => (
            <button
              key={p.id}
              onClick={() => setTab(p.tab)}
              title={p.label}
              className={cx(
                "group relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                product === p.id ? "bg-brandwash text-greenink" : "text-subtle hover:bg-elevated hover:text-text"
              )}
            >
              {product === p.id && <span className="absolute -left-3 h-5 w-0.5 rounded-full bg-accent" />}
              <Icon name={p.icon} className="h-[18px] w-[18px]" />
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowPalette(true)}
          title="Search (⌘K)"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-elevated hover:text-text"
        >
          <Icon name="search" className="h-[18px] w-[18px]" />
        </button>
      </nav>

      {/* Contextual sidebar */}
      <aside className="flex w-[15.5rem] shrink-0 flex-col border-r border-border bg-surface">
        <div className="relative p-2.5">
          <button
            onClick={() => setShowProjects((s) => !s)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 text-left transition-colors hover:border-borderhi hover:bg-elevated"
          >
            <Monogram name={current?.name ?? "?"} warm={current?.status === "warm"} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium leading-tight text-text">
                {current?.name ?? "Select a project"}
              </div>
              <div className="truncate text-[11px] leading-tight text-muted">
                {current ? projectSub(current) : "no project"}
              </div>
            </div>
            <Icon name="chevron" className="h-3.5 w-3.5 shrink-0 text-subtle" />
          </button>
          {showProjects && (
            <ProjectMenu
              dbs={dbs}
              selected={selected}
              onSelect={(id) => {
                setSelected(id);
                setShowProjects(false);
              }}
              onCreate={() => {
                setShowProjects(false);
                setCreating(true);
              }}
            />
          )}
        </div>

        <div className="px-4 pb-1 pt-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">{SECTION_LABEL[product]}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1">
          {product === "tables" ? (
            <TableTree tables={tables} active={activeTable} onPick={pickTable} />
          ) : (
            <div className="space-y-0.5">
              {SUBNAV[product].map((s) => (
                <button
                  key={s.tab}
                  onClick={() => setTab(s.tab)}
                  className={cx(
                    "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                    tab === s.tab ? "bg-elevated font-medium text-text" : "text-muted hover:bg-elevated hover:text-text"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        {current ? (
          <>
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-muted">{current.name}</span>
                <span className="text-subtle">/</span>
                <span className="font-medium text-text">{SECTION_LABEL[product]}</span>
                <Badge tone={current.status === "warm" ? "warm" : "cold"}>
                  {current.status === "warm" ? "Warm" : "Hibernated"}
                </Badge>
                <span className="text-subtle">
                  {current.region} · active {fmtAgo(current.last_active)}
                </span>
              </div>
              <Button variant="primary" size="sm" onClick={() => setShowConnect(true)}>
                <Icon name="plug" className="h-3.5 w-3.5" /> Connect
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-bg">
              <div key={tab + current.id}>
                {tab === "overview" && <Overview db={current} onGo={setTab} onChanged={refresh} />}
                {tab === "sql" && <SqlEditor db={current} onChanged={reloadTables} />}
                {tab === "tables" && (
                  <TablesView db={current} table={activeTable} onChanged={reloadTables} onPick={pickTable} tables={tables} />
                )}
                {tab === "replication" && <Replication db={current} onChanged={refresh} />}
                {tab === "functions" && <FunctionsView db={current} />}
                {tab === "cron" && <CronView db={current} />}
              </div>
            </div>
          </>
        ) : (
          <Empty onCreate={() => setCreating(true)} />
        )}
      </main>

      {creating && <CreateModal onClose={() => setCreating(false)} onCreate={onCreate} />}
      {showConnect && current && <ConnectDialog db={current} onClose={() => setShowConnect(false)} />}
      {showPalette && (
        <Palette
          dbs={dbs}
          onClose={() => setShowPalette(false)}
          onSelect={(id) => {
            setSelected(id);
            setShowPalette(false);
          }}
          onCreate={() => {
            setShowPalette(false);
            setCreating(true);
          }}
        />
      )}
    </div>
  );
}

function projectSub(d: DB): string {
  const status = d.status === "warm" ? "Warm" : "Hibernated";
  const n = d.table_count;
  return `${status} · ${n} ${n === 1 ? "table" : "tables"}`;
}

function TableTree({
  tables,
  active,
  onPick,
}: {
  tables: { name: string; rows: number }[];
  active: string | null;
  onPick: (name: string) => void;
}) {
  if (tables.length === 0) {
    return <div className="px-2.5 py-4 text-[12px] text-subtle">No tables yet — create one in the SQL Editor.</div>;
  }
  return (
    <div className="space-y-0.5">
      {tables.map((t) => (
        <button
          key={t.name}
          onClick={() => onPick(t.name)}
          className={cx(
            "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
            active === t.name ? "bg-elevated font-medium text-text" : "text-muted hover:bg-elevated hover:text-text"
          )}
        >
          <Icon name="table" className={cx("h-3.5 w-3.5 shrink-0", active === t.name ? "text-greenink" : "text-subtle")} />
          <span className="min-w-0 flex-1 truncate">{t.name}</span>
          <span className="font-mono text-[11px] text-subtle">{t.rows}</span>
        </button>
      ))}
    </div>
  );
}

function ProjectMenu({
  dbs,
  selected,
  onSelect,
  onCreate,
}: {
  dbs: DB[];
  selected: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={() => onSelect(selected ?? "")} />
      <div className="absolute left-2.5 right-2.5 top-[3.4rem] z-30 overflow-hidden rounded-xl border border-borderhi bg-overlay shadow-pop">
        <div className="border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-subtle">
          Projects <span className="ml-1 font-normal text-muted">{dbs.length}</span>
        </div>
        <div className="max-h-64 overflow-y-auto p-1.5">
          {dbs.map((d) => (
            <button
              key={d.id}
              onClick={() => onSelect(d.id)}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                selected === d.id ? "bg-elevated" : "hover:bg-elevated"
              )}
            >
              <Monogram name={d.name} warm={d.status === "warm"} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-text">{d.name}</div>
                <div className="truncate text-[11px] text-muted">{projectSub(d)}</div>
              </div>
              {selected === d.id && <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-greenink" />}
            </button>
          ))}
        </div>
        <button
          onClick={onCreate}
          className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-[13px] text-muted hover:bg-elevated hover:text-text"
        >
          <Icon name="plus" className="h-4 w-4 text-greenink" /> New project
        </button>
      </div>
    </>
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-bg">
      <LogoTile className="h-12 w-12" />
      <div className="text-center">
        <h2 className="text-lg font-semibold">Spin up your first database</h2>
        <p className="mt-1 max-w-sm text-[13px] text-muted">
          It's just SQLite — instant, one file. poopabase streams it to bucket storage so it survives, scales, and
          hibernates when idle.
        </p>
      </div>
      <Button variant="primary" onClick={onCreate}>
        <Icon name="plus" className="h-4 w-4" /> New project
      </Button>
    </div>
  );
}

function Palette({
  dbs,
  onClose,
  onSelect,
  onCreate,
}: {
  dbs: DB[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = dbs.filter((d) => d.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#0f1114]/30 pt-[18vh]" onClick={onClose}>
      <div
        className="w-[560px] overflow-hidden rounded-xl border border-borderhi bg-overlay shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Icon name="search" className="h-4 w-4 text-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects or run a command…"
            className="flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-subtle"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          <button
            onClick={onCreate}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13px] hover:bg-elevated"
          >
            <Icon name="plus" className="h-4 w-4 text-greenink" /> Create new project
          </button>
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => onSelect(d.id)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13px] hover:bg-elevated"
            >
              <Monogram name={d.name} warm={d.status === "warm"} />
              <span className="flex-1">{d.name}</span>
              <span className="font-mono text-[11px] text-subtle">{projectSub(d)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
