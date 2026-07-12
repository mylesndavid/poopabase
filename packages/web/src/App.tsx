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

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "activity" },
  { id: "sql", label: "SQL Editor", icon: "sql" },
  { id: "tables", label: "Tables", icon: "table" },
  { id: "replication", label: "Streaming", icon: "stream" },
  { id: "functions", label: "Functions", icon: "fn" },
  { id: "cron", label: "Cron Jobs", icon: "clock" },
];

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

  const onCreate = async (name: string) => {
    const db = await api.createDatabase(name);
    await refresh();
    setSelected(db.id);
    setTab("sql");
    setCreating(false);
  };

  return (
    <div className="grain flex h-full w-full overflow-hidden bg-bg text-text">
      {/* Sidebar */}
      <aside className="flex w-[264px] shrink-0 flex-col border-r border-border bg-[#0b0c0d]">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-[15px] shadow-glow">
            💩
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight">poopabase</span>
            <span className="mt-0.5 text-[10px] text-subtle">SQLite · streamed to the cloud</span>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 pb-2 pt-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">Databases</span>
          <button
            onClick={() => setCreating(true)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-elevated hover:text-text"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {dbs.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d.id)}
              className={cx(
                "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                selected === d.id ? "bg-elevated" : "hover:bg-elevated/50"
              )}
            >
              <Icon name="db" className={cx("h-4 w-4 shrink-0", selected === d.id ? "text-accent2" : "text-subtle")} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-text">{d.name}</div>
                <div className="truncate font-mono text-[10px] text-subtle">{d.id}</div>
              </div>
              <Dot tone={d.status === "warm" ? "warm" : "cold"} />
            </button>
          ))}
          {dbs.length === 0 && (
            <div className="px-2.5 py-6 text-center text-[12px] text-subtle">No databases yet.</div>
          )}
        </div>

        <div className="border-t border-border p-2">
          <button
            onClick={() => setShowPalette(true)}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[12px] text-muted hover:bg-elevated"
          >
            <span className="flex items-center gap-2">
              <Icon name="search" className="h-3.5 w-3.5" /> Command
            </span>
            <span className="flex items-center gap-1">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        {current ? (
          <>
            <header className="flex items-center justify-between border-b border-border px-6 py-3.5">
              <div className="flex items-center gap-3">
                <h1 className="text-[15px] font-semibold">{current.name}</h1>
                <Badge tone={current.status === "warm" ? "warm" : "cold"}>
                  <Dot tone={current.status === "warm" ? "warm" : "cold"} />
                  {current.status === "warm" ? "Warm" : "Hibernated"}
                </Badge>
                <span className="text-[12px] text-subtle">·</span>
                <span className="text-[12px] text-muted">{current.region}</span>
                <span className="text-[12px] text-subtle">· active {fmtAgo(current.last_active)}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-[11px] text-muted">
                  {current.connectionString}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(current.connectionString)}
                >
                  <Icon name="copy" className="h-3.5 w-3.5" />
                </Button>
              </div>
            </header>

            <nav className="flex items-center gap-1 border-b border-border px-4">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cx(
                    "relative flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors",
                    tab === t.id ? "text-text" : "text-subtle hover:text-muted"
                  )}
                >
                  <Icon name={t.icon} className="h-3.5 w-3.5" />
                  {t.label}
                  {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
                </button>
              ))}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div key={tab + current.id} className="animate-slideUp">
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
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <div className="text-5xl">💩</div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">Spin up your first database</h2>
        <p className="mt-1 max-w-sm text-[13px] text-muted">
          It's just SQLite — instant, one file. poopabase streams it to the cloud so it survives, scales, and hibernates
          when idle.
        </p>
      </div>
      <Button variant="primary" onClick={onCreate}>
        <Icon name="plus" className="h-4 w-4" /> New database
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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[18vh]" onClick={onClose}>
      <div
        className="w-[560px] overflow-hidden rounded-xl border border-borderhi bg-elevated shadow-pop animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Icon name="search" className="h-4 w-4 text-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search databases or run a command…"
            className="flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-subtle"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          <button
            onClick={onCreate}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-surface"
          >
            <Icon name="plus" className="h-4 w-4 text-accent2" /> Create new database
          </button>
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => onSelect(d.id)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-surface"
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
