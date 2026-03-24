import { createClient } from "@libsql/client";
import chalk from "chalk";
import { getDatabase, getDatabaseUrl, highlight, truncate } from "../utils.js";

const STOP_WORDS = new Set(["a","an","the","is","are","was","were","do","does","did","how","what","when","where","why","who","which","that","this","it","in","on","at","to","for","of","with","by","from","and","or","not","no","can","will","should","would","could","has","have","had"]);

function sanitizeFtsQuery(query: string): string {
  const words = query
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()));
  if (words.length === 0) return query.replace(/[^\w\s]/g, "");
  return words.map(w => `"${w}"`).join(" OR ");
}

export async function searchCommand(
  query: string,
  options: { db?: string; limit?: string }
): Promise<void> {
  const dbPath = getDatabase(options.db);
  const client = createClient({ url: getDatabaseUrl(dbPath) });

  const limit = parseInt(options.limit || "10", 10);

  console.log();
  console.log(
    chalk.dim(`  Searching for: `) + chalk.bold(query)
  );
  console.log();

  try {
    // Hybrid search: FTS5 BM25 ranking
    const result = await client.execute({
      sql: `
        SELECT
          c.id,
          c.content,
          c.section,
          c.chunk_index,
          d.source,
          d.title,
          rank AS score
        FROM chunks_fts
        JOIN chunks c ON c.id = chunks_fts.rowid
        JOIN documents d ON d.id = c.document_id
        WHERE chunks_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
      args: [sanitizeFtsQuery(query), limit],
    });

    if (result.rows.length === 0) {
      console.log(chalk.dim("  No results found."));
      console.log();
      console.log(chalk.dim("  Tips:"));
      console.log(chalk.dim("    - Try simpler search terms"));
      console.log(chalk.dim("    - Use individual words rather than phrases"));
      console.log(chalk.dim("    - Check ingested documents with `poop status`"));
      console.log();
      client.close();
      return;
    }

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      const score = Math.abs(Number(row.score)).toFixed(2);
      const source = String(row.source);
      const section = row.section ? String(row.section) : null;
      const content = String(row.content);

      // Format source path relative to cwd
      let displaySource = source;
      try {
        if (!source.startsWith("http")) {
          const rel = source.replace(process.cwd() + "/", "");
          displaySource = rel.length < source.length ? rel : source;
        }
      } catch {
        // keep original
      }

      console.log(
        chalk.green(`  ${score}`) +
          chalk.dim(` │ `) +
          chalk.cyan(displaySource) +
          (section ? chalk.dim(` > ${section}`) : "")
      );

      // Show highlighted content snippet
      const snippet = truncate(content.replace(/\n+/g, " "), 200);
      console.log(chalk.dim("       │ ") + highlight(snippet, query));
      console.log();
    }

    console.log(
      chalk.dim(`  ${result.rows.length} result(s)`)
    );
    console.log();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`  Error: ${msg}`));
    console.log();
  } finally {
    client.close();
  }
}
