import { createClient, type Client } from "@libsql/client";
import { DocsManager } from "./docs.js";
import { MemoryManager } from "./memory.js";
import { initializeSchema } from "./schema.js";
import type {
  PoopabaseConfig,
  ResultSet,
  Statement,
  SearchOptions,
  SearchResult,
} from "./types.js";

export class Poopabase {
  private client: Client;
  public readonly docs: DocsManager;
  public readonly memory: MemoryManager;

  constructor(config: PoopabaseConfig) {
    const url = config.url ?? "file:poopabase.db";

    this.client = createClient({
      url,
      authToken: config.authToken,
    });

    this.docs = new DocsManager(this.client);
    this.memory = new MemoryManager(this.client);
  }

  /**
   * Initialize the database schema. Must be called before first use.
   * Creates all required tables, indexes, and FTS virtual tables.
   */
  async initialize(): Promise<void> {
    await initializeSchema(this.client);
  }

  /**
   * Execute a raw SQL statement.
   */
  async execute(sql: string, args?: any[]): Promise<ResultSet> {
    return this.client.execute({
      sql,
      args: args ?? [],
    });
  }

  /**
   * Execute multiple SQL statements in a batch.
   */
  async batch(statements: Statement[]): Promise<ResultSet[]> {
    return this.client.batch(statements, "deferred");
  }

  /**
   * Hybrid search across both documents and memories.
   * Delegates to DocsManager.search().
   */
  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    return this.docs.search(query, options);
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    this.client.close();
  }
}
