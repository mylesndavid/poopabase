import { createClient } from "@libsql/client";
import chalk from "chalk";
import fs from "node:fs";
import { getDatabase, getDatabaseUrl, formatBytes } from "../utils.js";

export async function statusCommand(options: { db?: string }): Promise<void> {
  const dbPath = getDatabase(options.db);
  const client = createClient({ url: getDatabaseUrl(dbPath) });

  console.log();
  console.log(chalk.bold(`  Database Status`));
  console.log(chalk.dim("  ─────────────────────────────────"));

  try {
    // Database info
    let fileSize = 0;
    try {
      const stat = fs.statSync(dbPath);
      fileSize = stat.size;
    } catch {
      // Might be a remote database
    }

    console.log(`  Name:     ${chalk.cyan(dbPath.split("/").pop())}`);
    console.log(`  Path:     ${chalk.dim(dbPath)}`);
    if (fileSize > 0) {
      console.log(`  Size:     ${chalk.cyan(formatBytes(fileSize))}`);
    }
    console.log();

    // Counts
    const docCount = await client.execute(
      "SELECT COUNT(*) as count FROM documents"
    );
    const chunkCount = await client.execute(
      "SELECT COUNT(*) as count FROM chunks"
    );
    const obsCount = await client.execute(
      "SELECT COUNT(*) as count FROM observations"
    );
    const memCount = await client.execute(
      "SELECT COUNT(*) as count FROM memories"
    );

    console.log(chalk.bold("  Content"));
    console.log(chalk.dim("  ─────────────────────────────────"));
    console.log(
      `  Documents:      ${chalk.cyan(String(docCount.rows[0].count))}`
    );
    console.log(
      `  Chunks:         ${chalk.cyan(String(chunkCount.rows[0].count))}`
    );
    console.log(
      `  Observations:   ${chalk.cyan(String(obsCount.rows[0].count))}`
    );
    console.log(
      `  Memories:       ${chalk.cyan(String(memCount.rows[0].count))}`
    );
    console.log();

    // FTS status
    try {
      const ftsCheck = await client.execute(
        "SELECT COUNT(*) as count FROM chunks_fts"
      );
      console.log(
        `  FTS Index:      ${chalk.green("✓")} ${chalk.dim(`${ftsCheck.rows[0].count} entries`)}`
      );
    } catch {
      console.log(
        `  FTS Index:      ${chalk.red("✗")} ${chalk.dim("not initialized")}`
      );
    }

    // Check for embeddings
    const embeddingCount = await client.execute(
      "SELECT COUNT(*) as count FROM chunks WHERE embedding IS NOT NULL"
    );
    const embCount = Number(embeddingCount.rows[0].count);
    const totalChunks = Number(chunkCount.rows[0].count);
    if (totalChunks > 0) {
      const pct = ((embCount / totalChunks) * 100).toFixed(0);
      console.log(
        `  Embeddings:     ${embCount > 0 ? chalk.green("✓") : chalk.dim("○")} ${chalk.dim(`${embCount}/${totalChunks} (${pct}%)`)}`
      );
    }
    console.log();

    // Top 5 document sources
    const topDocs = await client.execute(`
      SELECT source, COUNT(*) as chunks, SUM(LENGTH(content)) as total_chars
      FROM documents
      GROUP BY source
      ORDER BY chunks DESC
      LIMIT 5
    `);

    if (topDocs.rows.length > 0) {
      console.log(chalk.bold("  Top Sources"));
      console.log(chalk.dim("  ─────────────────────────────────"));
      for (const row of topDocs.rows) {
        let source = String(row.source);
        // Shorten long paths
        if (source.length > 50) {
          source = "..." + source.slice(-47);
        }
        const chars = formatBytes(Number(row.total_chars));
        console.log(
          `  ${chalk.dim(chars.padStart(8))}  ${source}`
        );
      }
      console.log();
    }

    // Storage breakdown
    const docSize = await client.execute(
      "SELECT COALESCE(SUM(LENGTH(content)), 0) as size FROM documents"
    );
    const chunkSize = await client.execute(
      "SELECT COALESCE(SUM(LENGTH(content)), 0) as size FROM chunks"
    );
    const obsSize = await client.execute(
      "SELECT COALESCE(SUM(LENGTH(content)), 0) as size FROM observations"
    );
    const memSize = await client.execute(
      "SELECT COALESCE(SUM(LENGTH(content)), 0) as size FROM memories"
    );

    console.log(chalk.bold("  Storage (content)"));
    console.log(chalk.dim("  ─────────────────────────────────"));
    console.log(
      `  Documents:      ${chalk.cyan(formatBytes(Number(docSize.rows[0].size)))}`
    );
    console.log(
      `  Chunks:         ${chalk.cyan(formatBytes(Number(chunkSize.rows[0].size)))}`
    );
    console.log(
      `  Observations:   ${chalk.cyan(formatBytes(Number(obsSize.rows[0].size)))}`
    );
    console.log(
      `  Memories:       ${chalk.cyan(formatBytes(Number(memSize.rows[0].size)))}`
    );
    console.log();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`  ✗ Error: ${msg}`));
    console.log();
  } finally {
    client.close();
  }
}
