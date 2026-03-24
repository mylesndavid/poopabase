import { createClient, type InValue } from "@libsql/client";
import chalk from "chalk";
import crypto from "node:crypto";
import { getDatabase, getDatabaseUrl, formatTable } from "../utils.js";

function sanitizeCollectionName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "");
}

function tableName(collection: string): string {
  return `_col_${sanitizeCollectionName(collection)}`;
}

async function ensureCollection(
  client: ReturnType<typeof createClient>,
  collection: string
): Promise<void> {
  const table = tableName(collection);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "${table}" (
      id TEXT PRIMARY KEY,
      data JSON NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

export async function collectInsertCommand(
  collection: string,
  jsonStr: string,
  options: { db?: string }
): Promise<void> {
  const dbPath = getDatabase(options.db);
  const client = createClient({ url: getDatabaseUrl(dbPath) });

  console.log();

  try {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      console.log(chalk.red("  Error: Invalid JSON"));
      console.log();
      client.close();
      return;
    }

    await ensureCollection(client, collection);

    const id = (data._id as string) || crypto.randomUUID();
    delete data._id;

    const table = tableName(collection);
    await client.execute({
      sql: `INSERT INTO "${table}" (id, data) VALUES (?, ?)`,
      args: [id, JSON.stringify(data)],
    });

    console.log(chalk.green("  Inserted document"));
    console.log(chalk.dim(`  Collection: `) + chalk.bold(sanitizeCollectionName(collection)));
    console.log(chalk.dim(`  ID: `) + chalk.bold(id));
    console.log(chalk.dim(`  Data: `) + JSON.stringify(data));
    console.log();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`  Error: ${msg}`));
    console.log();
  } finally {
    client.close();
  }
}

export async function collectFindCommand(
  collection: string,
  filter: string | undefined,
  options: { db?: string }
): Promise<void> {
  const dbPath = getDatabase(options.db);
  const client = createClient({ url: getDatabaseUrl(dbPath) });

  console.log();

  try {
    const table = tableName(collection);

    // Check if collection exists
    const tableCheck = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      args: [table],
    });
    if (tableCheck.rows.length === 0) {
      console.log(chalk.dim(`  Collection "${sanitizeCollectionName(collection)}" does not exist.`));
      console.log();
      client.close();
      return;
    }

    let filterObj: Record<string, unknown> | null = null;
    if (filter) {
      try {
        filterObj = JSON.parse(filter);
      } catch {
        console.log(chalk.red("  Error: Invalid filter JSON"));
        console.log();
        client.close();
        return;
      }
    }

    let sql: string;
    const args: InValue[] = [];

    if (filterObj && Object.keys(filterObj).length > 0) {
      const conditions = Object.entries(filterObj).map(([key, value]) => {
        args.push(JSON.stringify(value));
        return `json_extract(data, '$.${key.replace(/'/g, "''")}') = json_extract(?, '$')`;
      });
      sql = `SELECT id, data, created_at FROM "${table}" WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`;
    } else {
      sql = `SELECT id, data, created_at FROM "${table}" ORDER BY created_at DESC`;
    }

    const result = await client.execute({ sql, args });

    if (result.rows.length === 0) {
      console.log(chalk.dim("  No documents found."));
      console.log();
      client.close();
      return;
    }

    // Build display rows with flattened data fields
    const displayRows: Record<string, unknown>[] = [];
    const dataKeys = new Set<string>();

    for (const row of result.rows) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(String(row.data));
      } catch {
        // keep empty
      }
      for (const key of Object.keys(parsed)) {
        dataKeys.add(key);
      }
    }

    const columns = ["id", ...Array.from(dataKeys), "created_at"];

    for (const row of result.rows) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(String(row.data));
      } catch {
        // keep empty
      }
      const display: Record<string, unknown> = {
        id: row.id,
        created_at: row.created_at,
      };
      for (const key of dataKeys) {
        const val = parsed[key];
        display[key] = typeof val === "object" ? JSON.stringify(val) : val;
      }
      displayRows.push(display);
    }

    console.log(formatTable(displayRows, columns));
    console.log();
    console.log(chalk.dim(`  ${result.rows.length} document(s)`));
    console.log();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`  Error: ${msg}`));
    console.log();
  } finally {
    client.close();
  }
}

export async function collectDeleteCommand(
  collection: string,
  id: string,
  options: { db?: string }
): Promise<void> {
  const dbPath = getDatabase(options.db);
  const client = createClient({ url: getDatabaseUrl(dbPath) });

  console.log();

  try {
    const table = tableName(collection);
    const result = await client.execute({
      sql: `DELETE FROM "${table}" WHERE id = ?`,
      args: [id],
    });

    if (result.rowsAffected === 0) {
      console.log(chalk.dim(`  No document found with ID: ${id}`));
    } else {
      console.log(chalk.green("  Deleted document"));
      console.log(chalk.dim(`  Collection: `) + chalk.bold(sanitizeCollectionName(collection)));
      console.log(chalk.dim(`  ID: `) + chalk.bold(id));
    }
    console.log();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`  Error: ${msg}`));
    console.log();
  } finally {
    client.close();
  }
}

export async function collectListCommand(
  options: { db?: string }
): Promise<void> {
  const dbPath = getDatabase(options.db);
  const client = createClient({ url: getDatabaseUrl(dbPath) });

  console.log();

  try {
    const result = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_col_%' ORDER BY name`
    );

    if (result.rows.length === 0) {
      console.log(chalk.dim("  No collections found."));
      console.log();
      client.close();
      return;
    }

    const rows: Record<string, unknown>[] = [];
    for (const row of result.rows) {
      const name = String(row.name).replace(/^_col_/, "");
      const countResult = await client.execute(
        `SELECT COUNT(*) as count FROM "${String(row.name)}"`
      );
      const count = Number(countResult.rows[0].count);
      rows.push({ collection: name, documents: count });
    }

    console.log(formatTable(rows, ["collection", "documents"]));
    console.log();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`  Error: ${msg}`));
    console.log();
  } finally {
    client.close();
  }
}

export async function collectDropCommand(
  collection: string,
  options: { db?: string }
): Promise<void> {
  const dbPath = getDatabase(options.db);
  const client = createClient({ url: getDatabaseUrl(dbPath) });

  console.log();

  try {
    const table = tableName(collection);

    // Check if collection exists
    const tableCheck = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      args: [table],
    });
    if (tableCheck.rows.length === 0) {
      console.log(chalk.dim(`  Collection "${sanitizeCollectionName(collection)}" does not exist.`));
      console.log();
      client.close();
      return;
    }

    await client.execute(`DROP TABLE "${table}"`);

    console.log(chalk.green("  Dropped collection"));
    console.log(chalk.dim(`  Collection: `) + chalk.bold(sanitizeCollectionName(collection)));
    console.log();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`  Error: ${msg}`));
    console.log();
  } finally {
    client.close();
  }
}
