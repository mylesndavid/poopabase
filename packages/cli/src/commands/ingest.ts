import { createClient } from "@libsql/client";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import { getDatabase, getDatabaseUrl } from "../utils.js";

const SUPPORTED_EXTENSIONS = [".md", ".txt", ".pdf", ".json", ".csv", ".html"];
const TARGET_CHUNK_SIZE = 500;

interface ChunkResult {
  content: string;
  section: string | null;
}

/**
 * Structure-aware chunking: split on markdown headers, then paragraphs,
 * targeting ~500 chars per chunk.
 */
function chunkText(text: string): ChunkResult[] {
  const chunks: ChunkResult[] = [];

  // Split by markdown headers
  const sections = text.split(/^(#{1,6}\s+.+)$/m);

  let currentSection: string | null = null;
  let currentBuffer = "";

  for (const part of sections) {
    const headerMatch = part.match(/^#{1,6}\s+(.+)$/);
    if (headerMatch) {
      // Flush current buffer
      if (currentBuffer.trim()) {
        pushChunks(chunks, currentBuffer.trim(), currentSection);
      }
      currentSection = headerMatch[1].trim();
      currentBuffer = "";
      continue;
    }

    currentBuffer += part;
  }

  // Flush remaining
  if (currentBuffer.trim()) {
    pushChunks(chunks, currentBuffer.trim(), currentSection);
  }

  // If no chunks were created, make one from the whole text
  if (chunks.length === 0 && text.trim()) {
    chunks.push({ content: text.trim(), section: null });
  }

  return chunks;
}

function pushChunks(
  chunks: ChunkResult[],
  text: string,
  section: string | null
): void {
  if (text.length <= TARGET_CHUNK_SIZE * 1.5) {
    chunks.push({ content: text, section });
    return;
  }

  // Split on double newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/);
  let buffer = "";

  for (const para of paragraphs) {
    if (buffer.length + para.length > TARGET_CHUNK_SIZE && buffer.length > 0) {
      chunks.push({ content: buffer.trim(), section });
      buffer = "";
    }
    buffer += (buffer ? "\n\n" : "") + para;
  }

  if (buffer.trim()) {
    chunks.push({ content: buffer.trim(), section });
  }
}

async function resolveFiles(inputPath: string): Promise<string[]> {
  const resolved = path.resolve(inputPath);

  // Check if it's a URL
  if (inputPath.startsWith("http://") || inputPath.startsWith("https://")) {
    return [inputPath];
  }

  if (!fs.existsSync(resolved)) {
    // Try as glob pattern
    const matches = await glob(inputPath, { absolute: true });
    if (matches.length > 0) return matches;
    throw new Error(`Path not found: ${inputPath}`);
  }

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    return [resolved];
  }

  if (stat.isDirectory()) {
    const pattern = `${resolved}/**/*{${SUPPORTED_EXTENSIONS.join(",")}}`;
    const matches = await glob(pattern, { absolute: true });
    return matches.sort();
  }

  return [resolved];
}

async function readContent(filePath: string): Promise<string> {
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${filePath}: ${response.statusText}`);
    }
    return response.text();
  }

  return fs.readFileSync(filePath, "utf-8");
}

export async function ingestCommand(
  inputPath: string,
  options: { db?: string }
): Promise<void> {
  const dbPath = getDatabase(options.db);
  const client = createClient({ url: getDatabaseUrl(dbPath) });

  console.log();

  const spinner = ora({
    text: "Finding files...",
    prefixText: " ",
  }).start();

  try {
    const files = await resolveFiles(inputPath);

    if (files.length === 0) {
      spinner.fail("No supported files found");
      console.log(
        chalk.dim(
          `  Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`
        )
      );
      console.log();
      client.close();
      return;
    }

    spinner.text = `Ingesting ${files.length} file(s)...`;

    let totalDocs = 0;
    let totalChunks = 0;

    for (const file of files) {
      const filename = file.startsWith("http")
        ? file
        : path.relative(process.cwd(), file);
      spinner.text = `Ingesting ${filename}...`;

      try {
        const content = await readContent(file);
        const ext = path.extname(file).toLowerCase();
        const title = path.basename(file, ext);

        // Insert document
        const docResult = await client.execute({
          sql: `INSERT INTO documents (source, title, type, content) VALUES (?, ?, ?, ?)`,
          args: [file, title, ext.replace(".", "") || "text", content],
        });

        const documentId = Number(docResult.lastInsertRowid);
        totalDocs++;

        // Chunk the content
        const chunks = chunkText(content);

        // Insert chunks
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          await client.execute({
            sql: `INSERT INTO chunks (document_id, content, section, chunk_index) VALUES (?, ?, ?, ?)`,
            args: [documentId, chunk.content, chunk.section, i],
          });
          totalChunks++;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        spinner.warn(`Failed to ingest ${filename}: ${msg}`);
        spinner.start();
      }
    }

    spinner.succeed(
      chalk.green(
        `Ingested ${totalDocs} document(s), ${totalChunks} chunk(s)`
      )
    );

    console.log();
    console.log(chalk.dim(`  Database: ${dbPath}`));
    console.log(
      chalk.dim(`  Documents: ${totalDocs} | Chunks: ${totalChunks}`)
    );
    console.log();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    spinner.fail(chalk.red(msg));
    console.log();
  } finally {
    client.close();
  }
}
