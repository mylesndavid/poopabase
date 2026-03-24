import type { ChunkData } from "./types.js";

const TARGET_CHUNK_SIZE = 500; // chars
const OVERLAP_SIZE = 50; // chars

/**
 * Structure-aware document chunker.
 * Splits on markdown headers first, then paragraphs, then sentences.
 * Each chunk carries its section hierarchy and position metadata.
 */
export function chunkDocument(content: string): ChunkData[] {
  const sections = splitBySections(content);
  const chunks: ChunkData[] = [];
  let position = 0;
  let charOffset = 0;

  for (const section of sections) {
    const sectionChunks = chunkSection(section.content, TARGET_CHUNK_SIZE);

    for (const text of sectionChunks) {
      chunks.push({
        content: text,
        metadata: {
          section: section.headings,
          position,
          charOffset,
        },
      });
      // Advance offset by the chunk size minus overlap (approximate)
      charOffset += text.length;
      position++;
    }
  }

  return chunks;
}

interface Section {
  headings: string[];
  content: string;
}

/**
 * Split content into sections based on markdown headers.
 * Tracks the heading hierarchy so each section knows its path.
 */
function splitBySections(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];
  const headingStack: string[] = [];
  let currentContent: string[] = [];
  let currentLevel = 0;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      // Flush current section
      const text = currentContent.join("\n").trim();
      if (text.length > 0) {
        sections.push({
          headings: [...headingStack],
          content: text,
        });
      }
      currentContent = [];

      // Update heading stack
      const level = headerMatch[1].length;
      const heading = headerMatch[2].trim();

      if (level > currentLevel) {
        headingStack.push(heading);
      } else {
        // Pop back to the appropriate level and replace
        while (headingStack.length >= level) {
          headingStack.pop();
        }
        headingStack.push(heading);
      }
      currentLevel = level;
    } else {
      currentContent.push(line);
    }
  }

  // Flush remaining content
  const text = currentContent.join("\n").trim();
  if (text.length > 0) {
    sections.push({
      headings: [...headingStack],
      content: text,
    });
  }

  // If no sections were created (no headers), treat the whole document as one section
  if (sections.length === 0 && content.trim().length > 0) {
    sections.push({
      headings: [],
      content: content.trim(),
    });
  }

  return sections;
}

/**
 * Chunk a section of text to approximately targetSize characters.
 * Splits on paragraphs first, then sentences if needed.
 * Applies overlap between chunks.
 */
function chunkSection(text: string, targetSize: number): string[] {
  if (text.length <= targetSize) {
    return [text];
  }

  // Split on double newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const rawChunks = mergeSegments(paragraphs, targetSize);

  // If any chunk is still too large, split on sentences
  const refined: string[] = [];
  for (const chunk of rawChunks) {
    if (chunk.length > targetSize * 1.5) {
      const sentences = splitSentences(chunk);
      const subChunks = mergeSegments(sentences, targetSize);
      refined.push(...subChunks);
    } else {
      refined.push(chunk);
    }
  }

  // Apply overlap between consecutive chunks
  return applyOverlap(refined, OVERLAP_SIZE);
}

/**
 * Merge an array of text segments into chunks of approximately targetSize.
 */
function mergeSegments(segments: string[], targetSize: number): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (current.length === 0) {
      current = trimmed;
    } else if (current.length + trimmed.length + 2 <= targetSize) {
      current += "\n\n" + trimmed;
    } else {
      chunks.push(current);
      current = trimmed;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Split text into sentences using common sentence boundaries.
 */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.filter((s) => s.trim().length > 0);
}

/**
 * Apply overlap between consecutive chunks by prepending tail of previous chunk.
 */
function applyOverlap(chunks: string[], overlapSize: number): string[] {
  if (chunks.length <= 1) return chunks;

  const result: string[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    // Take the last overlapSize chars from the previous chunk
    const overlap = prev.slice(-overlapSize);
    // Trim to word boundary to avoid cutting words
    const wordBoundary = overlap.indexOf(" ");
    const cleanOverlap =
      wordBoundary >= 0 ? overlap.slice(wordBoundary + 1) : overlap;
    result.push(cleanOverlap + " " + chunks[i]);
  }

  return result;
}
