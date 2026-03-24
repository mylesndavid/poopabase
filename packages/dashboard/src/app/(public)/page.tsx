"use client";

import Link from "next/link";
import { useState } from "react";

const features = [
  {
    icon: "🗄️",
    title: "SQL Database",
    description: "Full relational database. Tables, joins, indexes.",
  },
  {
    icon: "📦",
    title: "Collections",
    description: "Schemaless NoSQL. Just throw JSON at it.",
  },
  {
    icon: "🔍",
    title: "Document Search",
    description: "Ingest files. FTS5 hybrid search.",
  },
  {
    icon: "🧠",
    title: "Agent Memory",
    description: "Observe, compact, recall. Agents remember.",
  },
  {
    icon: "🔌",
    title: "MCP Server",
    description: "Claude Code, Cursor, Windsurf. One command.",
  },
  {
    icon: "📁",
    title: "One File",
    description: "Everything in a single .poop.db SQLite file.",
  },
];

const codeExamples: Record<string, string> = {
  TypeScript: `import { Poopabase } from "@poopabase/sdk";

const db = new Poopabase("myproject.poop.db");

// SQL
const users = await db.query("SELECT * FROM users WHERE role = ?", ["founder"]);

// Collections
await db.collection("events").insert({ type: "signup", ts: Date.now() });

// Search
const results = await db.search("authentication flow");`,
  Python: `from poopabase import Poopabase

db = Poopabase("myproject.poop.db")

# SQL
users = db.query("SELECT * FROM users WHERE role = ?", ["founder"])

# Collections
db.collection("events").insert({"type": "signup", "ts": time.time()})

# Search
results = db.search("authentication flow")`,
  CLI: `# Initialize a new database
$ poop init myproject

# Run SQL queries
$ poop query "SELECT * FROM users"

# Insert into collections
$ poop collect insert events '{"type": "signup"}'

# Search across documents
$ poop search "authentication flow"

# Start MCP server
$ poop serve`,
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="ml-3 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 font-mono text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-700"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<string>("TypeScript");

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <style jsx>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.7s ease-out both;
        }
        .animate-delay-100 {
          animation-delay: 0.1s;
        }
        .animate-delay-200 {
          animation-delay: 0.2s;
        }
        .animate-delay-300 {
          animation-delay: 0.3s;
        }
        .animate-delay-400 {
          animation-delay: 0.4s;
        }
        .animate-delay-500 {
          animation-delay: 0.5s;
        }
        @keyframes pulse-glow {
          0%,
          100% {
            box-shadow: 0 0 20px rgba(34, 197, 94, 0.15);
          }
          50% {
            box-shadow: 0 0 40px rgba(34, 197, 94, 0.25);
          }
        }
        .glow-green {
          animation: pulse-glow 3s ease-in-out infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .cursor-blink::after {
          content: "▋";
          animation: blink 1.2s step-end infinite;
          color: #22c55e;
        }
      `}</style>

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-neutral-800/50 bg-neutral-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="mr-1">💩</span> poopabase
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/docs"
              className="hidden rounded-md px-3 py-2 text-sm text-neutral-400 transition-colors hover:text-white sm:inline-block"
            >
              Docs
            </Link>
            <a
              href="https://github.com/nicholasgriffintn/poopabase"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-md px-3 py-2 text-sm text-neutral-400 transition-colors hover:text-white sm:inline-block"
            >
              GitHub
            </a>
            <Link
              href="/signin"
              className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
            >
              Sign In
            </Link>
            <Link
              href="/local"
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-20 pt-24 sm:pt-32 md:pt-40">
        {/* Gradient background effect */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(34, 197, 94, 0.08) 0%, transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="animate-fade-in-up text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
            The database
            <br />
            <span className="bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
              for agents.
            </span>
          </h1>
          <p className="animate-fade-in-up animate-delay-100 mx-auto mt-6 max-w-2xl text-lg text-neutral-400 sm:text-xl">
            SQL. Collections. Documents. Search. Memory.
            <br className="hidden sm:block" />
            <span className="text-neutral-300"> One file.</span>
          </p>
          <div className="animate-fade-in-up animate-delay-200 mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/local"
              className="glow-green inline-flex h-12 items-center rounded-lg bg-green-600 px-8 text-base font-semibold text-white transition-colors hover:bg-green-500"
            >
              Get Started
            </Link>
            <Link
              href="/docs"
              className="inline-flex h-12 items-center rounded-lg border border-neutral-700 px-8 text-base font-semibold text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
            >
              View Docs
            </Link>
          </div>

          {/* Terminal block */}
          <div className="animate-fade-in-up animate-delay-300 mx-auto mt-16 max-w-2xl">
            <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/80 shadow-2xl">
              <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-neutral-700" />
                <div className="h-3 w-3 rounded-full bg-neutral-700" />
                <div className="h-3 w-3 rounded-full bg-neutral-700" />
                <span className="ml-2 text-xs text-neutral-500">terminal</span>
              </div>
              <pre className="overflow-x-auto p-6 text-left font-mono text-sm leading-relaxed">
                <code>
                  <span className="text-neutral-500">$</span>{" "}
                  <span className="text-green-400">poop</span>{" "}
                  <span className="text-white">init myproject</span>
                  {"\n"}
                  <span className="text-yellow-400">
                    {"💩 Database created: myproject.poop.db"}
                  </span>
                  {"\n\n"}
                  <span className="text-neutral-500">$</span>{" "}
                  <span className="text-green-400">poop</span>{" "}
                  <span className="text-white">
                    {"collect insert users "}
                  </span>
                  <span className="text-amber-300">
                    {"'{\"name\": \"Myles\", \"role\": \"founder\"}'"}
                  </span>
                  {"\n"}
                  <span className="text-green-400">
                    {"✓ Inserted into \"users\""}
                  </span>
                  {"\n\n"}
                  <span className="text-neutral-500">$</span>{" "}
                  <span className="text-green-400">poop</span>{" "}
                  <span className="text-white">
                    {"search "}
                  </span>
                  <span className="text-amber-300">
                    {"\"authentication flow\""}
                  </span>
                  {"\n"}
                  <span className="text-green-400">3 results found</span>
                  {"\n"}
                  <span className="cursor-blink" />
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="animate-fade-in-up mb-4 text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need
          </h2>
          <p className="animate-fade-in-up animate-delay-100 mx-auto mb-16 max-w-xl text-center text-neutral-400">
            Six primitives. One database. Zero configuration.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="animate-fade-in-up group rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="mb-3 text-2xl">{feature.icon}</div>
                <h3 className="mb-1 text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-neutral-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Examples */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="animate-fade-in-up mb-4 text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Works everywhere
          </h2>
          <p className="animate-fade-in-up animate-delay-100 mx-auto mb-12 max-w-xl text-center text-neutral-400">
            Use poopabase from any language or the command line.
          </p>
          <div className="animate-fade-in-up animate-delay-200 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/80">
            <div className="flex border-b border-neutral-800">
              {Object.keys(codeExamples).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? "border-b-2 border-green-500 bg-neutral-800/50 text-white"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <pre className="overflow-x-auto p-6 font-mono text-sm leading-relaxed">
              <code className="text-neutral-300">
                {codeExamples[activeTab]}
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="animate-fade-in-up mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Ready to build?
          </h2>
          <p className="animate-fade-in-up animate-delay-100 mb-10 text-lg text-neutral-400">
            Get started in under 30 seconds.
          </p>
          <div className="animate-fade-in-up animate-delay-200 mb-8">
            <Link
              href="/local"
              className="glow-green inline-flex h-14 items-center rounded-xl bg-green-600 px-10 text-lg font-semibold text-white transition-colors hover:bg-green-500"
            >
              Get Started
            </Link>
          </div>
          <div className="animate-fade-in-up animate-delay-300 inline-flex items-center rounded-lg border border-neutral-800 bg-neutral-900/80 px-5 py-3">
            <code className="font-mono text-sm text-neutral-300">
              npm install -g @poopabase/cli
            </code>
            <CopyButton text="npm install -g @poopabase/cli" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-800/50 px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="text-lg font-bold tracking-tight">
            <span className="mr-1">💩</span> poopabase
          </div>
          <div className="flex items-center gap-6 text-sm text-neutral-500">
            <a
              href="https://github.com/nicholasgriffintn/poopabase"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-neutral-300"
            >
              GitHub
            </a>
            <Link href="/docs" className="transition-colors hover:text-neutral-300">
              Docs
            </Link>
            <a
              href="https://discord.gg/poopabase"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-neutral-300"
            >
              Discord
            </a>
          </div>
          <p className="text-sm text-neutral-600">
            Built with libSQL
          </p>
        </div>
      </footer>
    </div>
  );
}
