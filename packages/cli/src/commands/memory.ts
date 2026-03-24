import { createClient } from "@libsql/client";
import chalk from "chalk";
import { getDatabase, getDatabaseUrl, highlight, truncate } from "../utils.js";

export async function observeCommand(
  text: string,
  options: { db?: string; source?: string }
): Promise<void> {
  const dbPath = getDatabase(options.db);
  const client = createClient({ url: getDatabaseUrl(dbPath) });

  try {
    const result = await client.execute({
      sql: `INSERT INTO observations (content, source) VALUES (?, ?)`,
      args: [text, options.source || "cli"],
    });

    const id = Number(result.lastInsertRowid);

    console.log();
    console.log(chalk.green(`  ✓ Observation stored (id: ${id})`));
    console.log(chalk.dim(`  "${truncate(text, 80)}"`));
    console.log();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`  ✗ Error: ${msg}`));
    console.log();
  } finally {
    client.close();
  }
}

export async function recallCommand(
  query: string,
  options: { db?: string; limit?: string }
): Promise<void> {
  const dbPath = getDatabase(options.db);
  const client = createClient({ url: getDatabaseUrl(dbPath) });
  const limit = parseInt(options.limit || "10", 10);

  console.log();
  console.log(
    chalk.dim(`  Recalling: `) + chalk.bold(query)
  );
  console.log();

  try {
    // Search both observations and memories via FTS
    const obsResult = await client.execute({
      sql: `
        SELECT o.id, o.content, o.source, o.created_at, 'observation' as type, rank as score
        FROM observations_fts
        JOIN observations o ON o.id = observations_fts.rowid
        WHERE observations_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
      args: [query, limit],
    });

    const memResult = await client.execute({
      sql: `
        SELECT m.id, m.content, m.type, m.strength, m.created_at, 'memory' as kind, rank as score
        FROM memories_fts
        JOIN memories m ON m.id = memories_fts.rowid
        WHERE memories_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
      args: [query, limit],
    });

    // Display memories first (they're compacted/higher signal)
    if (memResult.rows.length > 0) {
      console.log(chalk.bold.cyan("  Memories:"));
      console.log();
      for (const row of memResult.rows) {
        const strength = Number(row.strength).toFixed(1);
        const content = String(row.content);
        console.log(
          chalk.magenta(`  [${strength}]`) +
            chalk.dim(` ${row.type} `) +
            highlight(truncate(content.replace(/\n/g, " "), 150), query)
        );
        console.log(
          chalk.dim(`         ${row.created_at}`)
        );
        console.log();
      }
    }

    if (obsResult.rows.length > 0) {
      console.log(chalk.bold.cyan("  Observations:"));
      console.log();
      for (const row of obsResult.rows) {
        const content = String(row.content);
        console.log(
          chalk.dim(`  [${row.source}] `) +
            highlight(truncate(content.replace(/\n/g, " "), 150), query)
        );
        console.log(
          chalk.dim(`         ${row.created_at}`)
        );
        console.log();
      }
    }

    const total = obsResult.rows.length + memResult.rows.length;
    if (total === 0) {
      console.log(chalk.dim("  No memories found."));
      console.log();
    } else {
      console.log(
        chalk.dim(
          `  ${memResult.rows.length} memory(s), ${obsResult.rows.length} observation(s)`
        )
      );
      console.log();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`  ✗ Error: ${msg}`));
    console.log();
  } finally {
    client.close();
  }
}

export async function compactCommand(options: { db?: string }): Promise<void> {
  const dbPath = getDatabase(options.db);
  const client = createClient({ url: getDatabaseUrl(dbPath) });

  console.log();
  console.log(chalk.dim("  Compacting observations into memories..."));
  console.log();

  try {
    // Get uncompacted observations (those not yet part of any memory)
    const obsResult = await client.execute(`
      SELECT id, content, created_at
      FROM observations
      WHERE id NOT IN (
        SELECT value
        FROM memories, json_each(memories.observation_ids)
      )
      ORDER BY created_at
    `);

    if (obsResult.rows.length === 0) {
      console.log(chalk.dim("  No uncompacted observations."));
      console.log();
      client.close();
      return;
    }

    console.log(
      chalk.dim(
        `  Found ${obsResult.rows.length} uncompacted observation(s).`
      )
    );

    // Group observations by similarity (simple approach: group consecutive observations)
    // In a real system this would use embeddings; here we group by time proximity
    const groups: Array<Array<{ id: number; content: string }>> = [];
    let currentGroup: Array<{ id: number; content: string }> = [];

    for (const row of obsResult.rows) {
      currentGroup.push({
        id: Number(row.id),
        content: String(row.content),
      });

      // Group every 5 observations or when we hit the end
      if (currentGroup.length >= 5) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    let memoriesCreated = 0;

    for (const group of groups) {
      // Create a merged memory from the group
      const mergedContent = group.map((o) => o.content).join("\n---\n");
      const ids = group.map((o) => o.id);

      // Extract common themes (simple: first 200 chars of combined)
      const summary =
        group.length === 1
          ? group[0].content
          : `Compacted from ${group.length} observations:\n${mergedContent}`;

      await client.execute({
        sql: `INSERT INTO memories (content, type, strength, observation_ids) VALUES (?, 'compacted', ?, ?)`,
        args: [summary, Math.min(group.length, 5), JSON.stringify(ids)],
      });

      memoriesCreated++;
    }

    console.log(
      chalk.green(
        `  ✓ Created ${memoriesCreated} memory(s) from ${obsResult.rows.length} observation(s)`
      )
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

export async function memoryStatusCommand(options: {
  db?: string;
}): Promise<void> {
  const dbPath = getDatabase(options.db);
  const client = createClient({ url: getDatabaseUrl(dbPath) });

  console.log();

  try {
    const obsCount = await client.execute(
      "SELECT COUNT(*) as count FROM observations"
    );
    const memCount = await client.execute(
      "SELECT COUNT(*) as count FROM memories"
    );

    // Count uncompacted
    const uncompacted = await client.execute(`
      SELECT COUNT(*) as count FROM observations
      WHERE id NOT IN (
        SELECT value FROM memories, json_each(memories.observation_ids)
      )
    `);

    console.log(chalk.bold("  Memory Status"));
    console.log(chalk.dim("  ─────────────────────────────"));
    console.log(
      `  Observations:  ${chalk.cyan(String(obsCount.rows[0].count))}`
    );
    console.log(
      `  Memories:      ${chalk.cyan(String(memCount.rows[0].count))}`
    );
    console.log(
      `  Uncompacted:   ${chalk.yellow(String(uncompacted.rows[0].count))}`
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
