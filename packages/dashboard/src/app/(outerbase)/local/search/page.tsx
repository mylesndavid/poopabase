"use client";

import { Input } from "@/components/ui/input";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import NavigationLayout from "../../nav-layout";

const API_BASE = "http://localhost:3141";

type SearchMode = "hybrid" | "keyword" | "vector";

interface SearchResult {
  id?: string;
  score: number;
  source: string;
  title?: string;
  section: string;
  content: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery, limit: 10 }),
        });
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const data = await res.json();
        setResults(data.results ?? []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to connect to poopabase API"
        );
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, performSearch]);

  return (
    <NavigationLayout>
      <div className="flex flex-1 flex-col content-start gap-4 overflow-x-hidden overflow-y-auto p-4">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pt-8">
          <h1 className="text-center text-lg font-bold">Search</h1>
          <p className="text-muted-foreground text-center text-sm">
            Search across ingested documents using hybrid, keyword, or vector
            modes.
          </p>

          <div className="relative">
            <MagnifyingGlass className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search documents..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex justify-center gap-1">
            {(["hybrid", "keyword", "vector"] as SearchMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-neutral-200/75 text-secondary-foreground dark:bg-neutral-800/75"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mx-auto w-full max-w-2xl rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-muted-foreground mx-auto pt-8 text-sm">
            Searching...
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
            <span className="text-muted-foreground text-sm">
              {results.length} results via {mode} search
            </span>
            {results.map((result, i) => (
              <div
                key={result.id ?? i}
                className="bg-background flex flex-col gap-2 rounded-lg border p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-neutral-200/75 px-1.5 py-0.5 text-xs font-medium dark:bg-neutral-800/75">
                    {(result.score ?? 0).toFixed(2)}
                  </span>
                  <span className="rounded border px-1.5 py-0.5 text-xs">
                    {result.source}
                  </span>
                  {result.section && (
                    <span className="text-muted-foreground text-xs">
                      {result.section}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed">{result.content}</p>
              </div>
            ))}
          </div>
        )}

        {!loading && query.trim() && results.length === 0 && !error && (
          <div className="text-muted-foreground mx-auto pt-8 text-sm">
            No results found.
          </div>
        )}
      </div>
    </NavigationLayout>
  );
}
