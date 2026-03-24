#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { initCommand } from "./commands/init.js";
import { shellCommand } from "./commands/shell.js";
import { ingestCommand } from "./commands/ingest.js";
import { searchCommand } from "./commands/search.js";
import {
  observeCommand,
  recallCommand,
  compactCommand,
  memoryStatusCommand,
} from "./commands/memory.js";
import { statusCommand } from "./commands/status.js";
import { serveCommand } from "./commands/serve.js";
import {
  collectInsertCommand,
  collectFindCommand,
  collectDeleteCommand,
  collectListCommand,
  collectDropCommand,
} from "./commands/collect.js";

const program = new Command();

program
  .name("poop")
  .description("the poopabase CLI")
  .version("0.1.0");

program
  .command("init")
  .argument("[name]", "database name", "default")
  .description("Create a new poopabase database")
  .action(async (name: string) => {
    await initCommand(name);
  });

program
  .command("shell")
  .argument("[name]", "database name")
  .option("--db <path>", "database path or name")
  .description("Interactive SQL shell")
  .action(async (name: string | undefined, options: { db?: string }) => {
    await shellCommand(name, options);
  });

program
  .command("ingest")
  .argument("<path>", "file, directory, or URL to ingest")
  .option("--db <path>", "database path or name")
  .description("Ingest documents (file, directory, or URL)")
  .action(async (path: string, options: { db?: string }) => {
    await ingestCommand(path, options);
  });

program
  .command("search")
  .argument("<query>", "search query")
  .option("--db <path>", "database path or name")
  .option("--limit <n>", "max results", "10")
  .description("Search documents")
  .action(
    async (query: string, options: { db?: string; limit?: string }) => {
      await searchCommand(query, options);
    }
  );

program
  .command("recall")
  .argument("<query>", "search query")
  .option("--db <path>", "database path or name")
  .option("--limit <n>", "max results", "10")
  .description("Recall memories")
  .action(
    async (query: string, options: { db?: string; limit?: string }) => {
      await recallCommand(query, options);
    }
  );

program
  .command("observe")
  .argument("<text>", "observation text")
  .option("--db <path>", "database path or name")
  .option("--source <source>", "observation source", "cli")
  .description("Store an observation/memory")
  .action(
    async (
      text: string,
      options: { db?: string; source?: string }
    ) => {
      await observeCommand(text, options);
    }
  );

program
  .command("compact")
  .option("--db <path>", "database path or name")
  .description("Compact observations into memories")
  .action(async (options: { db?: string }) => {
    await compactCommand(options);
  });

program
  .command("status")
  .option("--db <path>", "database path or name")
  .description("Show database stats")
  .action(async (options: { db?: string }) => {
    await statusCommand(options);
  });

program
  .command("serve")
  .option("--port <port>", "server port", "3141")
  .option("--db <path>", "database path or name")
  .option("--url <url>", "libSQL/Turso database URL")
  .option("--token <token>", "database auth token")
  .option("--mcp", "output MCP tool definitions")
  .description("Start HTTP server (optionally with MCP)")
  .action(
    async (options: { port?: string; db?: string; url?: string; token?: string; mcp?: boolean }) => {
      await serveCommand(options);
    }
  );

program
  .command("push")
  .argument("<file>", "SQLite file to upload")
  .description("Upload a SQLite file as a poopabase")
  .action(async (file: string) => {
    console.log();
    console.log(
      chalk.yellow(
        `  Push is not yet available. File: ${file}`
      )
    );
    console.log(
      chalk.dim("  This will upload to poopabase cloud in a future version.")
    );
    console.log();
  });

program
  .command("pull")
  .option("--db <path>", "database path or name")
  .description("Download database locally")
  .action(async (options: { db?: string }) => {
    console.log();
    console.log(chalk.yellow("  Pull is not yet available."));
    console.log(
      chalk.dim(
        "  This will download from poopabase cloud in a future version."
      )
    );
    if (options.db) {
      console.log(chalk.dim(`  Database: ${options.db}`));
    }
    console.log();
  });

program
  .command("studio")
  .option("--db <path>", "database path or name")
  .option("--port <port>", "port for studio", "4000")
  .description("Open database in Outerbase Studio")
  .action(async (options: { db?: string; port?: string }) => {
    const dbPath = getDatabase(options.db);
    const port = options.port || "4000";
    console.log();
    console.log(chalk.bold("  💩 Poopabase Studio"));
    console.log(chalk.dim(`  Database: ${dbPath}`));
    console.log();
    console.log(chalk.green(`  Opening http://localhost:${port}`));
    console.log();

    // Launch outerbase studio via npx
    const { execSync } = await import("child_process");
    try {
      execSync(`npx @outerbase/studio "${dbPath}" --port ${port}`, {
        stdio: "inherit",
      });
    } catch {
      // User quit with q or ctrl+c
    }
  });

const collect = program
  .command("collect")
  .description("Manage schemaless document collections");

collect
  .command("insert")
  .argument("<collection>", "collection name")
  .argument("<json>", "JSON document to insert")
  .option("--db <path>", "database path or name")
  .description("Insert a JSON document into a collection")
  .action(
    async (collection: string, jsonStr: string, options: { db?: string }) => {
      await collectInsertCommand(collection, jsonStr, options);
    }
  );

collect
  .command("find")
  .argument("<collection>", "collection name")
  .argument("[filter]", "optional JSON filter")
  .option("--db <path>", "database path or name")
  .description("Find documents in a collection")
  .action(
    async (
      collection: string,
      filter: string | undefined,
      options: { db?: string }
    ) => {
      await collectFindCommand(collection, filter, options);
    }
  );

collect
  .command("delete")
  .argument("<collection>", "collection name")
  .argument("<id>", "document ID")
  .option("--db <path>", "database path or name")
  .description("Delete a document by ID")
  .action(
    async (collection: string, id: string, options: { db?: string }) => {
      await collectDeleteCommand(collection, id, options);
    }
  );

collect
  .command("list")
  .option("--db <path>", "database path or name")
  .description("List all collections")
  .action(async (options: { db?: string }) => {
    await collectListCommand(options);
  });

collect
  .command("drop")
  .argument("<collection>", "collection name")
  .option("--db <path>", "database path or name")
  .description("Drop an entire collection")
  .action(async (collection: string, options: { db?: string }) => {
    await collectDropCommand(collection, options);
  });

program.parse();
