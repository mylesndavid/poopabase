import fs from "node:fs";
import path from "node:path";

/**
 * StorageBackend is the "bucket" abstraction. Today it is backed by the local
 * filesystem so the whole platform runs anywhere with zero setup. The interface
 * is intentionally the S3/R2 primitive set (put / get / list / delete) so a
 * `S3Bucket` implementation can be dropped in for production hosting with no
 * changes to the replicator.
 */
export interface StorageObject {
  key: string;
  size: number;
  lastModified: number;
}

export interface StorageBackend {
  readonly kind: string;
  readonly location: string;
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): Promise<StorageObject[]>;
  delete(key: string): Promise<void>;
}

export class LocalBucket implements StorageBackend {
  readonly kind = "local";
  readonly location: string;

  constructor(private root: string) {
    this.location = root;
    fs.mkdirSync(root, { recursive: true });
  }

  private resolve(key: string): string {
    return path.join(this.root, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.resolve(key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFileSync(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.resolve(key));
  }

  async list(prefix: string): Promise<StorageObject[]> {
    const base = this.resolve(prefix);
    const out: StorageObject[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else {
          const stat = fs.statSync(full);
          out.push({
            key: path.relative(this.root, full).split(path.sep).join("/"),
            size: stat.size,
            lastModified: stat.mtimeMs,
          });
        }
      }
    };
    walk(base);
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }

  async delete(key: string): Promise<void> {
    const file = this.resolve(key);
    if (fs.existsSync(file)) fs.rmSync(file, { recursive: true, force: true });
  }
}
