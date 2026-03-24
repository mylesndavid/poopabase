import { createClient } from "@libsql/client";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "../schema.js";

export async function initCommand(name?: string): Promise<void> {
  const dbName = name || "default";
  const dbFile = `${dbName}.poop.db`;
  const dbPath = path.resolve(dbFile);

  console.log();
  console.log(chalk.bold(`  Creating poopabase database...`));
  console.log();

  // Check if file already exists
  if (fs.existsSync(dbPath)) {
    console.log(chalk.yellow(`  Database ${dbFile} already exists.`));
    console.log(chalk.dim(`  Path: ${dbPath}`));
    console.log();
    return;
  }

  // Create the database and initialize schema
  const client = createClient({ url: `file:${dbPath}` });

  try {
    for (const sql of SCHEMA_SQL) {
      await client.execute(sql);
    }

    // Write .poopabase config
    const config = { name: dbName, path: dbFile };
    fs.writeFileSync(
      path.resolve(".poopabase"),
      JSON.stringify(config, null, 2) + "\n"
    );

    console.log(chalk.green(`  ✓ Database created: ${dbFile}`));
    console.log();
    console.log(chalk.dim(`  Path:   ${dbPath}`));
    console.log(chalk.dim(`  Config: ${path.resolve(".poopabase")}`));
    console.log();
    console.log(chalk.cyan(`  Tables created:`));
    console.log(chalk.dim(`    documents      — document storage`));
    console.log(chalk.dim(`    chunks         — chunked content with FTS5`));
    console.log(chalk.dim(`    observations   — raw observations`));
    console.log(chalk.dim(`    memories       — compacted memories`));
    console.log();
    console.log(`  Get started:`);
    console.log(chalk.cyan(`    poop ingest ./docs`));
    console.log(chalk.cyan(`    poop search "your query"`));
    console.log(chalk.cyan(`    poop observe "something interesting"`));
    console.log();
  } finally {
    client.close();
  }
}
