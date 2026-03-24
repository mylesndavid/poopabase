import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";

export interface PoopabaseConfig {
  name: string;
  path: string;
}

/**
 * Find .poopabase config file by walking up directories, or use --db flag value.
 * Returns the database file path.
 */
export function getDatabase(dbFlag?: string): string {
  if (dbFlag) {
    // If it's already a path to a .poop.db file, use it directly
    if (dbFlag.endsWith(".poop.db")) {
      return path.resolve(dbFlag);
    }
    // Otherwise treat it as a database name
    return path.resolve(`${dbFlag}.poop.db`);
  }

  // Walk up directories looking for .poopabase config
  let dir = process.cwd();
  while (true) {
    const configPath = path.join(dir, ".poopabase");
    if (fs.existsSync(configPath)) {
      try {
        const config: PoopabaseConfig = JSON.parse(
          fs.readFileSync(configPath, "utf-8")
        );
        return path.resolve(dir, config.path);
      } catch {
        // Invalid config, keep looking
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Look for any .poop.db file in current directory
  const files = fs.readdirSync(process.cwd());
  const dbFile = files.find((f) => f.endsWith(".poop.db"));
  if (dbFile) {
    return path.resolve(dbFile);
  }

  console.error(
    chalk.red(
      "  No poopabase database found. Run `poop init` to create one."
    )
  );
  process.exit(1);
}

/**
 * Get the libsql file: URL for a database path
 */
export function getDatabaseUrl(dbPath: string): string {
  return `file:${dbPath}`;
}

/**
 * Format rows as an aligned table with chalk coloring.
 */
export function formatTable(
  rows: Record<string, unknown>[],
  columns?: string[]
): string {
  if (rows.length === 0) return chalk.dim("  (no results)");

  const cols = columns || Object.keys(rows[0]);

  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const col of cols) {
    widths[col] = col.length;
    for (const row of rows) {
      const val = String(row[col] ?? "NULL");
      widths[col] = Math.max(widths[col], val.length);
    }
    // Cap width at 60 chars
    widths[col] = Math.min(widths[col], 60);
  }

  const lines: string[] = [];

  // Header
  const header = cols
    .map((col) => chalk.bold.cyan(col.padEnd(widths[col])))
    .join("  ");
  lines.push("  " + header);

  // Separator
  const sep = cols.map((col) => chalk.dim("─".repeat(widths[col]))).join("──");
  lines.push("  " + sep);

  // Rows
  for (const row of rows) {
    const line = cols
      .map((col) => {
        let val = String(row[col] ?? chalk.dim("NULL"));
        if (val.length > 60) val = val.substring(0, 57) + "...";
        return val.padEnd(widths[col]);
      })
      .join("  ");
    lines.push("  " + line);
  }

  return lines.join("\n");
}

/**
 * Format bytes as human-readable size.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Highlight matching terms in text using chalk.
 */
export function highlight(text: string, query: string): string {
  if (!query) return text;
  const terms = query
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (terms.length === 0) return text;

  const regex = new RegExp(`(${terms.join("|")})`, "gi");
  return text.replace(regex, (match) => chalk.bold.yellow(match));
}

/**
 * Truncate text to a max length, adding ellipsis.
 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + "...";
}
