"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Plus, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import NavigationLayout from "../../nav-layout";

const API_BASE = "http://localhost:3141";

interface Document {
  id?: string;
  source: string;
  title?: string;
  type: string;
  chunks?: number;
  created_at?: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [showIngestForm, setShowIngestForm] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [content, setContent] = useState("");

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/docs`);
      if (!res.ok) throw new Error(`Failed to fetch documents (${res.status})`);
      const data = await res.json();
      const docs: Document[] = data.rows ?? data.documents ?? [];
      setDocuments(docs);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect to poopabase API"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleIngest = useCallback(async () => {
    if (!sourceName.trim() || !content.trim()) return;

    setIngesting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/docs/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content,
          source: sourceName,
          type: "markdown",
        }),
      });
      if (!res.ok) throw new Error(`Ingest failed (${res.status})`);
      setSourceName("");
      setContent("");
      setShowIngestForm(false);
      await fetchDocuments();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to ingest document"
      );
    } finally {
      setIngesting(false);
    }
  }, [sourceName, content, fetchDocuments]);

  return (
    <NavigationLayout>
      <div className="flex flex-1 flex-col content-start gap-4 overflow-x-hidden overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Documents</h1>
            <p className="text-muted-foreground text-sm">
              Ingest and manage documents for agent retrieval.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowIngestForm(!showIngestForm)}
          >
            {showIngestForm ? (
              <>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Ingest
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        {showIngestForm && (
          <div className="bg-background flex flex-col gap-3 rounded-lg border p-4">
            <Input
              placeholder="Source name (e.g. README.md)"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
            />
            <Textarea
              placeholder="Paste document content here..."
              className="min-h-[120px]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleIngest} disabled={ingesting}>
                {ingesting ? "Ingesting..." : "Ingest Document"}
              </Button>
            </div>
          </div>
        )}

        <div className="bg-background rounded-lg border">
          <div className="grid grid-cols-[1fr_100px_120px] gap-4 border-b px-4 py-2 text-sm font-medium">
            <span>Source</span>
            <span>Type</span>
            <span>Created</span>
          </div>
          {loading && (
            <div className="text-muted-foreground flex items-center justify-center py-12 text-sm">
              Loading documents...
            </div>
          )}
          {!loading && documents.length === 0 && (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-sm">
              <FileText className="h-8 w-8" />
              <span>No documents ingested yet.</span>
            </div>
          )}
          {!loading &&
            documents.map((doc, i) => (
              <div
                key={doc.id ?? `${doc.source}-${i}`}
                className="hover:bg-secondary grid grid-cols-[1fr_100px_120px] gap-4 border-b px-4 py-2.5 text-sm last:border-b-0"
              >
                <span className="truncate font-medium">
                  {doc.title ?? doc.source}
                </span>
                <span>
                  <span className="rounded border px-1.5 py-0.5 text-xs">
                    {doc.type}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {doc.created_at
                    ? new Date(doc.created_at).toLocaleDateString()
                    : "—"}
                </span>
              </div>
            ))}
        </div>
      </div>
    </NavigationLayout>
  );
}
