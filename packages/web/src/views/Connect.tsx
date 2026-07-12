import React, { useState } from "react";
import type { DB } from "../api";
import { Icon, cx } from "../ui";

type TabId = "uri" | "drivers" | "psql";

export function ConnectDialog({ db, onClose }: { db: DB; onClose: () => void }) {
  const [tab, setTab] = useState<TabId>("uri");
  const c = db.connect;
  const uri = c.uri;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1114]/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-[640px] max-w-[92vw] overflow-hidden rounded-2xl border border-borderhi bg-surface shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pb-3 pt-5">
          <div>
            <div className="text-[15px] font-semibold text-text">Connect to {db.name}</div>
            <div className="mt-0.5 text-[12px] text-muted">
              Any Postgres client works — poopabase speaks the Postgres wire protocol.
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-subtle hover:bg-elevated"
          >
            <Icon name="x" className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex gap-5 border-b border-border px-5">
          {(
            [
              ["uri", "Connection string"],
              ["drivers", "Drivers"],
              ["psql", "psql"],
            ] as [TabId, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cx(
                "-mb-px border-b-2 py-2 text-[13px] transition-colors",
                tab === id ? "border-accent font-medium text-text" : "border-transparent text-subtle hover:text-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="px-5 pb-5 pt-4">
          {tab === "uri" && <UriTab uri={uri} c={db.connect} />}
          {tab === "drivers" && <DriversTab uri={uri} c={db.connect} />}
          {tab === "psql" && <PsqlTab uri={uri} />}

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#cfeede] bg-brandwash px-3 py-2 text-[11.5px] text-muted">
            <Icon name="bolt" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-greenink" />
            <span>
              {db.status === "hibernated"
                ? "This database is hibernated — the first connection rehydrates it from the bucket, then serves at in-memory SQLite speed."
                : "Queries run against the in-memory SQLite engine and every write streams to the bucket. Dialect is SQLite, not Postgres SQL."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2.5">
      <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-text">{value}</code>
      <button
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-semibold text-accentdark hover:bg-accent2"
      >
        <Icon name={copied ? "check" : "copy"} className="h-3 w-3" />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function UriTab({ uri, c }: { uri: string; c: DB["connect"] }) {
  const fields: [string, string][] = [
    ["Host", c.host],
    ["Port", String(c.port)],
    ["Database", c.database],
    ["User", c.user],
    ["Pool mode", c.poolMode],
    ["SSL", c.ssl ? "required" : "disabled (local)"],
  ];
  return (
    <div>
      <Label>Connection string</Label>
      <CopyRow value={uri} />
      <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3">
        {fields.map(([k, v]) => (
          <div key={k}>
            <div className="text-[10.5px] uppercase tracking-wide text-subtle">{k}</div>
            <div className="mt-0.5 truncate font-mono text-[12px] text-text">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DriversTab({ uri, c }: { uri: string; c: DB["connect"] }) {
  const [driver, setDriver] = useState<"node" | "python" | "go">("node");
  const snippets: Record<string, string> = {
    node: `import { Client } from "pg";\n\nconst client = new Client("${uri}");\nawait client.connect();\nconst { rows } = await client.query("SELECT * FROM users LIMIT 10");\nconsole.log(rows);`,
    python: `import psycopg\n\nwith psycopg.connect("${uri}") as conn:\n    rows = conn.execute("SELECT * FROM users LIMIT 10").fetchall()\n    print(rows)`,
    go: `db, _ := sql.Open("pgx", "${uri}")\nrows, _ := db.Query("SELECT * FROM ${c.database === "" ? "users" : "users"} LIMIT 10")\ndefer rows.Close()`,
  };
  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-border bg-bg p-0.5 text-[12px]">
        {(
          [
            ["node", "node-postgres"],
            ["python", "psycopg"],
            ["go", "pgx"],
          ] as [typeof driver, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setDriver(id)}
            className={cx(
              "rounded-md px-2.5 py-1 transition-colors",
              driver === id ? "bg-surface font-medium text-text shadow-card" : "text-muted hover:text-text"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <pre className="overflow-x-auto rounded-lg border border-borderhi bg-[#0e1512] px-3.5 py-3 font-mono text-[12px] leading-relaxed text-[#d7e5dd]">
        {snippets[driver]}
      </pre>
    </div>
  );
}

function PsqlTab({ uri }: { uri: string }) {
  return (
    <div>
      <Label>Connect with psql</Label>
      <pre className="overflow-x-auto rounded-lg border border-borderhi bg-[#0e1512] px-3.5 py-3 font-mono text-[12px] text-[#d7e5dd]">
        <span className="text-[#4a7a63]">$ </span>psql "{uri}"
      </pre>
      <div className="mt-2 text-[11.5px] text-muted">
        Plain SQL works. psql meta-commands that read <code className="font-mono">pg_catalog</code> (\dt, tab-complete)
        aren't supported yet — use the Table Editor to browse schema.
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-subtle">{children}</div>
  );
}
