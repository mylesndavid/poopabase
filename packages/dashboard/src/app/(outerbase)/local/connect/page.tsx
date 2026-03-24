"use client";

import { Copy, Check, Terminal, Plugs, Robot, MagnifyingGlass } from "@phosphor-icons/react";
import { useState, useCallback } from "react";
import NavigationLayout from "../../nav-layout";

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <div className="group relative">
      <label className="text-muted-foreground mb-1.5 block text-xs font-medium uppercase tracking-wider">
        {label}
      </label>
      <div className="bg-secondary flex items-center justify-between rounded-lg border p-3 font-mono text-sm">
        <code className="overflow-x-auto whitespace-pre">{value}</code>
        <button
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground ml-3 shrink-0 cursor-pointer transition-colors"
        >
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-background rounded-xl border p-6">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="text-muted-foreground h-5 w-5" />
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <div className="flex flex-col gap-4">
        {children}
      </div>
    </div>
  );
}

export default function ConnectPage() {
  const dbUrl = "http://localhost:3141";

  return (
    <NavigationLayout>
      <div className="flex flex-1 flex-col content-start gap-6 overflow-x-hidden overflow-y-auto p-6">
        <div>
          <h1 className="text-2xl font-bold">Connect to poopabase</h1>
          <p className="text-muted-foreground mt-1">
            Connect your app, agent, or CLI to your poopabase database.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Connection String */}
          <Section title="Connection String" icon={Plugs}>
            <CopyBlock
              label="HTTP Endpoint"
              value={dbUrl}
            />
            <CopyBlock
              label="Hrana Protocol (libSQL compatible)"
              value={`${dbUrl}/v3/pipeline`}
            />
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium uppercase tracking-wider">
                TypeScript / JavaScript
              </label>
              <div className="bg-secondary overflow-x-auto rounded-lg border p-3 font-mono text-sm">
                <pre className="text-foreground">{`import { createClient } from "@libsql/client";

const db = createClient({
  url: "${dbUrl}",
});

const result = await db.execute("SELECT * FROM my_table");`}</pre>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium uppercase tracking-wider">
                Python
              </label>
              <div className="bg-secondary overflow-x-auto rounded-lg border p-3 font-mono text-sm">
                <pre className="text-foreground">{`import libsql_experimental as libsql

conn = libsql.connect("${dbUrl}")
result = conn.execute("SELECT * FROM my_table")`}</pre>
              </div>
            </div>
          </Section>

          {/* CLI */}
          <Section title="CLI" icon={Terminal}>
            <CopyBlock
              label="Install"
              value="npm install -g @poopabase/cli"
            />
            <CopyBlock
              label="Create a database"
              value="poop init myproject"
            />
            <CopyBlock
              label="Ingest documents"
              value="poop ingest ./docs/"
            />
            <CopyBlock
              label="Search"
              value='poop search "how does authentication work"'
            />
            <CopyBlock
              label="Start server"
              value="poop serve --port 3141"
            />
            <CopyBlock
              label="Open Studio"
              value="poop studio"
            />
          </Section>

          {/* MCP Server */}
          <Section title="MCP Server (for AI Agents)" icon={Robot}>
            <p className="text-muted-foreground text-sm">
              Connect your AI agent to poopabase. Copy the config below for your tool.
            </p>

            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium uppercase tracking-wider">
                Claude Code
              </label>
              <p className="text-muted-foreground mb-2 text-xs">
                Run this in Claude Code to add poopabase as an MCP server:
              </p>
              <CopyBlock
                label=""
                value={`claude mcp add poopabase -- npx @poopabase/mcp --db ./myproject.poop.db`}
              />
            </div>

            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium uppercase tracking-wider">
                Claude Code (settings.json)
              </label>
              <div className="bg-secondary group relative overflow-x-auto rounded-lg border p-3 font-mono text-sm">
                <pre className="text-foreground">{`{
  "mcpServers": {
    "poopabase": {
      "command": "npx",
      "args": [
        "@poopabase/mcp",
        "--db", "./myproject.poop.db"
      ]
    }
  }
}`}</pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`{
  "mcpServers": {
    "poopabase": {
      "command": "npx",
      "args": [
        "@poopabase/mcp",
        "--db", "./myproject.poop.db"
      ]
    }
  }
}`);
                  }}
                  className="text-muted-foreground hover:text-foreground absolute right-3 top-3 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium uppercase tracking-wider">
                Cursor / Windsurf (mcp.json)
              </label>
              <div className="bg-secondary group relative overflow-x-auto rounded-lg border p-3 font-mono text-sm">
                <pre className="text-foreground">{`{
  "mcpServers": {
    "poopabase": {
      "command": "npx",
      "args": ["@poopabase/mcp", "--db", "./myproject.poop.db"]
    }
  }
}`}</pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`{
  "mcpServers": {
    "poopabase": {
      "command": "npx",
      "args": ["@poopabase/mcp", "--db", "./myproject.poop.db"]
    }
  }
}`);
                  }}
                  className="text-muted-foreground hover:text-foreground absolute right-3 top-3 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="text-muted-foreground mt-2 text-xs">
              <p className="font-medium">Available MCP Tools:</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li><code className="text-foreground">poopabase_search</code> — Hybrid document search</li>
                <li><code className="text-foreground">poopabase_query</code> — Execute SQL</li>
                <li><code className="text-foreground">poopabase_ingest</code> — Add documents</li>
                <li><code className="text-foreground">poopabase_recall</code> — Recall memories</li>
                <li><code className="text-foreground">poopabase_observe</code> — Store observations</li>
                <li><code className="text-foreground">poopabase_compact</code> — Compact memories</li>
                <li><code className="text-foreground">poopabase_status</code> — Database stats</li>
              </ul>
            </div>
          </Section>

          {/* Search */}
          <Section title="Full-Text Search" icon={MagnifyingGlass}>
            <p className="text-muted-foreground text-sm">
              poopabase includes built-in FTS5 full-text search with BM25 ranking. Ingest documents and search instantly.
            </p>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium uppercase tracking-wider">
                SQL (direct FTS5 query)
              </label>
              <div className="bg-secondary overflow-x-auto rounded-lg border p-3 font-mono text-sm">
                <pre className="text-foreground">{`-- Search chunks with BM25 ranking
SELECT c.content, d.source, rank
FROM chunks_fts
JOIN chunks c ON c.id = chunks_fts.rowid
JOIN documents d ON d.id = c.document_id
WHERE chunks_fts MATCH 'authentication'
ORDER BY rank
LIMIT 10;`}</pre>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium uppercase tracking-wider">
                API
              </label>
              <div className="bg-secondary overflow-x-auto rounded-lg border p-3 font-mono text-sm">
                <pre className="text-foreground">{`curl -X POST ${dbUrl}/search \\
  -H "Content-Type: application/json" \\
  -d '{"query": "authentication", "limit": 10}'`}</pre>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium uppercase tracking-wider">
                CLI
              </label>
              <div className="bg-secondary overflow-x-auto rounded-lg border p-3 font-mono text-sm">
                <pre className="text-foreground">{`poop search "authentication"
poop search --limit 20 "how does auth work"`}</pre>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </NavigationLayout>
  );
}
