import { createClient, type Client } from "@libsql/client";
import chalk from "chalk";
import readline from "node:readline";
import { getDatabase, getDatabaseUrl, formatTable } from "../utils.js";

export async function shellCommand(
  name?: string,
  options?: { db?: string }
): Promise<void> {
  const dbPath = getDatabase(options?.db || name);
  const client = createClient({ url: getDatabaseUrl(dbPath) });

  console.log();
  console.log(
    chalk.bold(`  Connected to ${chalk.cyan(dbPath)}`)
  );
  console.log(
    chalk.dim(
      `  Type SQL to execute. .tables, .schema [table], .quit to exit.`
    )
  );
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.magenta("poop> "),
    terminal: true,
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    try {
      if (input === ".quit" || input === ".exit") {
        client.close();
        console.log(chalk.dim("  Bye!"));
        rl.close();
        process.exit(0);
      }

      if (input === ".tables") {
        await handleTables(client);
      } else if (input.startsWith(".schema")) {
        const tableName = input.split(/\s+/)[1];
        await handleSchema(client, tableName);
      } else {
        await handleSQL(client, input);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  Error: ${msg}`));
    }

    rl.prompt();
  });

  rl.on("close", () => {
    client.close();
    process.exit(0);
  });
}

async function handleTables(client: Client): Promise<void> {
  const result = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' AND name NOT LIKE '%_config' AND name NOT LIKE '%_data' AND name NOT LIKE '%_idx' AND name NOT LIKE '%_content' AND name NOT LIKE '%_docsize' ORDER BY name"
  );

  if (result.rows.length === 0) {
    console.log(chalk.dim("  (no tables)"));
    return;
  }

  console.log();
  for (const row of result.rows) {
    console.log(chalk.cyan(`  ${row.name}`));
  }
  console.log();
}

async function handleSchema(
  client: Client,
  tableName?: string
): Promise<void> {
  let query: string;
  if (tableName) {
    query = `SELECT sql FROM sqlite_master WHERE name='${tableName}'`;
  } else {
    query = `SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name`;
  }

  const result = await client.execute(query);

  console.log();
  for (const row of result.rows) {
    if (row.sql) {
      console.log(chalk.dim("  " + String(row.sql).replace(/\n/g, "\n  ")));
      console.log();
    }
  }
}

async function handleSQL(client: Client, sql: string): Promise<void> {
  const result = await client.execute(sql);

  if (result.rows.length > 0) {
    const columns = result.columns;
    const rows = result.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const col of columns) {
        obj[col] = row[col];
      }
      return obj;
    });

    console.log();
    console.log(formatTable(rows, columns));
    console.log();
    console.log(chalk.dim(`  ${result.rows.length} row(s)`));
    console.log();
  } else if (result.rowsAffected > 0) {
    console.log(
      chalk.green(`  ✓ ${result.rowsAffected} row(s) affected`)
    );
  } else {
    console.log(chalk.dim("  (ok)"));
  }
}
