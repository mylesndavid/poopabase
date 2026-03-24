export { Poopabase } from "./client.js";
export { DocsManager } from "./docs.js";
export { MemoryManager } from "./memory.js";
export { chunkDocument } from "./chunker.js";
export { initializeSchema } from "./schema.js";

export type {
  PoopabaseConfig,
  SearchOptions,
  SearchResult,
  Document,
  Chunk,
  Memory,
  ChunkData,
  ResultSet,
  Statement,
} from "./types.js";
