import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, type DB } from "./api";
import { Badge, Button, Dot, Icon, Kbd, cx, fmtAgo } from "./ui";
import { Overview } from "./views/Overview";
import { SqlEditor } from "./views/SqlEditor";
import { TablesView } from "./views/Tables";
import { Replication } from "./views/Replication";
import { FunctionsView } from "./views/Functions";
import { CronView } from "./views/Cron";
import { CreateModal } from "./views/CreateModal";

type Tab = "overview" | "sql" | "tables" | "replication" | "functions" | "cron";
type Product = "home" | "sql" | "tables" | "database";

const PRODUCTS: { id: Product; label: string; icon: string; tab: Tab }[] = [
  { id: "home", label: "Home", icon: "home", tab: "overview" },
  { id: "sql", label: "SQL Editor", icon: "sql", tab: "sql" },
  { id: "tables", label: "Table Editor", icon: "table", tab: "tables" },
  { id: "database", label: "Database", icon: "db", tab: "replication" },
];

const SUBNAV: Record<Product, { tab: Tab; label: string; icon: string }[]> = {
  home: [{ tab: "overview", label: "Overview", icon: "home" }],
  sql: [{ tab: "sql", label: "New query", icon: "sql" }],
  tables: [{ tab: "tables", label: "All tables", icon: "table" }],
  database: [
    { tab: "replication", label: "Replication", icon: "stream" },
    { tab: "functions", label: "Functions", icon: "fn" },
    { tab: "cron", label: "Cron Jobs", icon: "clock" },
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette((s) => !s);
      }
      if (e.key === "Escape") setShowPalette(false);
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

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-text">
      {/* Product icon rail */}
      <nav className="flex w-[3.25rem] shrink-0 flex-col items-center border-r border-border bg-bg py-2">
        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-accent text-[15px] shadow-glow">
          💩
        </div>
        <div className="flex flex-1 flex-col items-center gap-1 pt-1">
          {PRODUCTS.map((p) => (
            <button
              key={p.id}
              onClick={() => setTab(p.tab)}
              title={p.label}
              className={cx(
                "group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                product === p.id ? "bg-elevated text-text" : "text-subtle hover:bg-elevated hover:text-text"
              )}
            >
              {product === p.id && <span className="absolute -left-2 h-5 w-0.5 rounded-full bg-accent" />}
              <Icon name={p.icon} className="h-[18px] w-[18px]" />
            </button>
          ))}
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => setShowPalette(true)}
            title="Command menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-subtle transition-colors hover:bg-elevated hover:text-text"
          >
            <Icon name="search" className="h-[18px] w-[18px]" />
          </button>
          <button
            title="Docs"
            className="flex h-9 w-9 items-center justify-center rounded-md text-subtle transition-colors hover:bg-elevated hover:text-text"
          >
            <Icon name="book" className="h-[18px] w-[18px]" />
          </button>
          <button
            title="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-md text-subtle transition-colors hover:bg-elevated hover:text-text"
          >
            <Icon name="gear" className="h-[18px] w-[18px]" />
          </button>
        </div>
      </nav>

      {/* Contextual sidebar */}
      <aside className="flex w-[15rem] shrink-0 flex-col border-r border-border bg-surface">
        <div className="p-2">
          <button
            onClick={() => setShowPalette(true)}
            className="flex w-full items-center gap-2.5 rounded-md border border-border bg-bg px-2.5 py-2 text-left transition-colors hover:border-borderhi"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-accent/15 text-accent">
              <Icon name="db" className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium leading-tight text-text">
                {current?.name ?? "Select a project"}
              </div>
              <div className="truncate text-[11px] leading-tight text-subtle">
                {current ? (current.status === "warm" ? "Warm · in memory" : "Hibernated") : "no project"}
              </div>
            </div>
            <Icon name="chevron" className="h-3.5 w-3.5 shrink-0 text-subtle" />
          </button>
        </div>

        <div className="px-4 pb-1 pt-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">{SECTION_LABEL[product]}</span>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
          {SUBNAV[product].map((s) => (
            <button
              key={s.tab}
              onClick={() => setTab(s.tab)}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                tab === s.tab ? "bg-elevated text-text" : "text-muted hover:bg-elevated/60 hover:text-text"
              )}
            >
              <Icon name={s.icon} className={cx("h-4 w-4", tab === s.tab ? "text-accent" : "text-subtle")} />
              {s.label}
            </button>
          ))}
        </div>

        <div className="border-t border-border p-2">
          <div className="mb-1 flex items-center justify-between px-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">Projects</span>
            <button
              onClick={() => setCreating(true)}
              className="flex h-5 w-5 items-center justify-center rounded text-subtle hover:bg-elevated hover:text-text"
            >
              <Icon name="plus" className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-40 space-y-0.5 overflow-y-auto">
            {dbs.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelected(d.id)}
                className={cx(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                  selected === d.id ? "bg-elevated" : "hover:bg-elevated/60"
                )}
              >
                <Dot tone={d.status === "warm" ? "warm" : "cold"} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-text">{d.name}</span>
              </button>
            ))}
            {dbs.length === 0 && <div className="px-2 py-3 text-center text-[12px] text-subtle">No projects yet.</div>}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        {current ? (
          <>
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-subtle">{current.name}</span>
                <span className="text-subtle">/</span>
                <span className="font-medium text-text">{SECTION_LABEL[product]}</span>
                <Badge tone={current.status === "warm" ? "warm" : "cold"}>
                  <Dot tone={current.status === "warm" ? "warm" : "cold"} />
                  {current.status === "warm" ? "Warm" : "Hibernated"}
                </Badge>
                <span className="text-subtle">· {current.region} · active {fmtAgo(current.last_active)}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-[11px] text-muted">
                  {current.connectionString}
                </code>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(current.connectionString)}
                >
                  <Icon name="copy" className="h-3.5 w-3.5" /> Connect
                </Button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-bg">
              <div key={tab + current.id}>
                {tab === "overview" && <Overview db={current} onGo={setTab} onChanged={refresh} />}
                {tab === "sql" && <SqlEditor db={current} onChanged={refresh} />}
                {tab === "tables" && <TablesView db={current} />}
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

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-bg">
      <div className="text-5xl">💩</div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">Spin up your first database</h2>
        <p className="mt-1 max-w-sm text-[13px] text-muted">
          It's just SQLite — instant, one file. poopabase streams it to the cloud so it survives, scales, and hibernates
          when idle.
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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[18vh]" onClick={onClose}>
      <div
        className="w-[560px] overflow-hidden rounded-lg border border-borderhi bg-elevated shadow-pop"
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
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13px] hover:bg-surface"
          >
            <Icon name="plus" className="h-4 w-4 text-accent" /> Create new project
          </button>
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => onSelect(d.id)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13px] hover:bg-surface"
            >
              <Icon name="db" className="h-4 w-4 text-subtle" />
              <span className="flex-1">{d.name}</span>
              <span className="font-mono text-[11px] text-subtle">{d.id}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
