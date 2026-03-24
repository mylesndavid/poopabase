import type { ResultSet, InStatement } from "@libsql/client";

export type { ResultSet, InStatement as Statement };

export interface PoopabaseConfig {
  /** libsql:// URL for remote, or file: path for local SQLite */
  url?: string;
  /** Auth token for remote libSQL connections */
  authToken?: string;
  /** Embedding model identifier (placeholder for future use) */
  embeddingModel?: string; // default: 'all-MiniLM-L6-v2'
}

export interface SearchOptions {
  /** Maximum number of results to return (default: 10) */
  limit?: number;
  /** Metadata key-value filters */
  filter?: Record<string, any>;
  /** Search mode: hybrid BM25+vector, vector-only, or keyword-only (default: 'hybrid') */
  mode?: "hybrid" | "vector" | "keyword";
  /** Number of surrounding chunks to include as context */
  expandContext?: number;
}

export interface SearchResult {
  id: number;
  content: string;
  score: number;
  source: string;
  metadata: Record<string, any>;
  /** Surrounding chunk contents when expandContext > 0 */
  context?: string[];
}

export interface Document {
  id: number;
  source: string;
  type: string; // 'markdown' | 'text' | 'pdf' | 'url'
  content: string;
  metadata: Record<string, any>;
  ingestedAt: string;
}

export interface Chunk {
  id: number;
  docId: number;
  content: string;
  metadata: Record<string, any>;
  position: number; // chunk index within document
}

export interface Memory {
  id: number;
  type: string; // 'observation' | 'memory' | 'fact'
  content: string;
  importance: number; // 0-1
  metadata: Record<string, any>;
  createdAt: string;
  accessedAt: string;
  accessCount: number;
}

export interface ChunkData {
  content: string;
  metadata: {
    section: string[];
    position: number;
    charOffset: number;
  };
}
