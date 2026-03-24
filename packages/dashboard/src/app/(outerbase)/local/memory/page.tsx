"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Lightning, Plus } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import NavigationLayout from "../../nav-layout";

const API_BASE = "http://localhost:3141";

interface Observation {
  id: number;
  content: string;
  timestamp?: string;
  created_at?: string;
}

interface Memory {
  id: number;
  content: string;
  importance: number;
  accessCount: number;
  access_count?: number;
}

export default function MemoryPage() {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [observing, setObserving] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [newObservation, setNewObservation] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: "SELECT * FROM observations ORDER BY created_at DESC LIMIT 50",
        }),
      });
      if (!res.ok) throw new Error(`Failed to fetch observations (${res.status})`);
      const data = await res.json();
      const rows = data.rows ?? data.results ?? [];
      setObservations(
        rows.map((row: Record<string, unknown>) => ({
          id: row.id,
          content: row.content,
          timestamp:
            row.created_at
              ? new Date(row.created_at as string).toLocaleString()
              : undefined,
        }))
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect to poopabase API"
      );
    }

    // Fetch memories via recall with broad query
    try {
      const res = await fetch(`${API_BASE}/memory/recall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "*", limit: 100 }),
      });
      if (res.ok) {
        const data = await res.json();
        const items = data.results ?? data.memories ?? [];
        setMemories(
          items.map((item: Record<string, unknown>, i: number) => ({
            id: (item.id as number) ?? i,
            content: item.content as string,
            importance: (item.importance as number) ?? (item.score as number) ?? 0,
            accessCount: (item.access_count as number) ?? (item.accessCount as number) ?? 0,
          }))
        );
      }
    } catch {
      // Memory recall may not be available, that's ok
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddObservation = useCallback(async () => {
    if (!newObservation.trim()) return;

    setObserving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/memory/observe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newObservation }),
      });
      if (!res.ok) throw new Error(`Failed to add observation (${res.status})`);
      setNewObservation("");
      await fetchData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add observation"
      );
    } finally {
      setObserving(false);
    }
  }, [newObservation, fetchData]);

  const handleCompact = useCallback(async () => {
    setCompacting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/memory/compact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`Compact failed (${res.status})`);
      await fetchData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to compact memories"
      );
    } finally {
      setCompacting(false);
    }
  }, [fetchData]);

  const totalObservations = observations.length;
  const totalMemories = memories.length;
  const avgImportance =
    memories.length > 0
      ? (
          memories.reduce((sum, m) => sum + m.importance, 0) / memories.length
        ).toFixed(2)
      : "0.00";

  return (
    <NavigationLayout>
      <div className="flex flex-1 flex-col content-start gap-4 overflow-x-hidden overflow-y-auto p-4">
        <div>
          <h1 className="text-lg font-bold">Memory</h1>
          <p className="text-muted-foreground text-sm">
            Observations are compacted into long-term memories for agent
            context.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="grid flex-1 gap-4 lg:grid-cols-2">
          {/* Observations Panel */}
          <div className="bg-background flex flex-col rounded-lg border">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-bold">Observations</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCompact}
                disabled={compacting}
              >
                <Lightning className="mr-2 h-3.5 w-3.5" />
                {compacting ? "Compacting..." : "Compact"}
              </Button>
            </div>

            <div className="flex gap-2 border-b p-3">
              <Input
                placeholder="Add an observation..."
                value={newObservation}
                onChange={(e) => setNewObservation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddObservation();
                }}
                disabled={observing}
              />
              <Button
                size="sm"
                onClick={handleAddObservation}
                disabled={observing}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && (
                <div className="text-muted-foreground flex items-center justify-center py-12 text-sm">
                  Loading...
                </div>
              )}
              {!loading && observations.length === 0 && (
                <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-sm">
                  <Brain className="h-8 w-8" />
                  <span>No observations yet.</span>
                </div>
              )}
              {!loading &&
                observations.map((obs) => (
                  <div
                    key={obs.id}
                    className="flex flex-col gap-1 border-b px-4 py-2.5 last:border-b-0"
                  >
                    <span className="text-sm">{obs.content}</span>
                    <span className="text-muted-foreground text-xs">
                      {obs.timestamp}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Memories Panel */}
          <div className="bg-background flex flex-col rounded-lg border">
            <div className="flex items-center border-b px-4 py-3">
              <span className="text-sm font-bold">Memories</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && (
                <div className="text-muted-foreground flex items-center justify-center py-12 text-sm">
                  Loading...
                </div>
              )}
              {!loading && memories.length === 0 && (
                <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-sm">
                  <Brain className="h-8 w-8" />
                  <span>
                    No memories yet. Compact observations to create memories.
                  </span>
                </div>
              )}
              {!loading &&
                memories.map((mem) => (
                  <div
                    key={mem.id}
                    className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-neutral-200/75 px-1.5 py-0.5 text-xs font-medium dark:bg-neutral-800/75">
                        {mem.importance.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {mem.accessCount} accesses
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{mem.content}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="bg-background flex items-center gap-6 rounded-lg border px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Observations:</span>
            <span className="font-medium">{totalObservations}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Memories:</span>
            <span className="font-medium">{totalMemories}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Avg Importance:</span>
            <span className="font-medium">{avgImportance}</span>
          </div>
        </div>
      </div>
    </NavigationLayout>
  );
}
