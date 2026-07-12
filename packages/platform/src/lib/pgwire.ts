import net from "node:net";
import type Database from "better-sqlite3";
import type { Manager } from "./manager.js";

/**
 * A minimal — but real — PostgreSQL wire-protocol (v3) front-end that speaks to
 * the live SQLite engine. Any Postgres client (psql, node-postgres, etc.) can
 * connect to a poopabase database using its name as the Postgres `database`.
 *
 * Supports the startup/auth handshake, the simple query protocol (psql) and the
 * extended query protocol (parameterised statements used by driver libraries).
 * Results are returned in text format. SQL is SQLite dialect.
 */

// Postgres type OIDs we emit.
const OID_TEXT = 25;
const OID_INT8 = 20;
const OID_FLOAT8 = 701;
const OID_BOOL = 16;

function oidForSqliteType(type: string | null): number {
  if (!type) return OID_TEXT;
  const t = type.toUpperCase();
  if (t.includes("INT")) return OID_INT8;
  if (t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) return OID_FLOAT8;
  if (t.includes("BOOL")) return OID_BOOL;
  return OID_TEXT;
}

function encodeValue(v: unknown): Buffer | null {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return Buffer.from("\\x" + v.toString("hex"), "utf8");
  if (typeof v === "boolean") return Buffer.from(v ? "t" : "f", "utf8");
  if (typeof v === "bigint") return Buffer.from(v.toString(), "utf8");
  return Buffer.from(String(v), "utf8");
}

/** Incremental parser for the length-prefixed message stream. */
class MessageBuffer {
  private buf = Buffer.alloc(0);
  push(chunk: Buffer) {
    this.buf = Buffer.concat([this.buf, chunk]);
  }
  /** Startup/SSL messages have no type byte: [int32 len][body]. */
  takeStartup(): Buffer | null {
    if (this.buf.length < 4) return null;
    const len = this.buf.readInt32BE(0);
    if (this.buf.length < len) return null;
    const body = this.buf.subarray(4, len);
    this.buf = this.buf.subarray(len);
    return body;
  }
  /** Regular messages: [char tag][int32 len][body]. */
  takeMessage(): { type: string; body: Buffer } | null {
    if (this.buf.length < 5) return null;
    const type = String.fromCharCode(this.buf[0]);
    const len = this.buf.readInt32BE(1);
    if (this.buf.length < 1 + len) return null;
    const body = this.buf.subarray(5, 1 + len);
    this.buf = this.buf.subarray(1 + len);
    return { type, body };
  }
}

class Writer {
  private chunks: Buffer[] = [];
  msg(type: string, body: Buffer) {
    const header = Buffer.alloc(5);
    header.writeUInt8(type.charCodeAt(0), 0);
    header.writeInt32BE(body.length + 4, 1);
    this.chunks.push(header, body);
    return this;
  }
  raw(b: Buffer) {
    this.chunks.push(b);
    return this;
  }
  flush(sock: net.Socket) {
    if (this.chunks.length) sock.write(Buffer.concat(this.chunks));
    this.chunks = [];
  }
}

function cstr(s: string): Buffer {
  return Buffer.concat([Buffer.from(s, "utf8"), Buffer.from([0])]);
}

function readCString(buf: Buffer, offset: number): { value: string; offset: number } {
  const end = buf.indexOf(0, offset);
  return { value: buf.toString("utf8", offset, end), offset: end + 1 };
}

interface PreparedStatement {
  sql: string;
}
interface Portal {
  sql: string;
  params: (string | null)[];
}

export class PgWireServer {
  private server: net.Server;
  constructor(private manager: Manager, private port: number) {
    this.server = net.createServer((sock) => this.onConnection(sock));
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, "0.0.0.0", () => resolve());
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  private onConnection(sock: net.Socket) {
    const parser = new MessageBuffer();
    let authed = false;
    let dbName = "";
    let dbId: string | null = null;
    let handle: Database.Database | null = null;
    const prepared = new Map<string, PreparedStatement>();
    const portals = new Map<string, Portal>();

    const fail = (message: string, code = "42000") => {
      const w = new Writer();
      w.msg(
        "E",
        Buffer.concat([
          Buffer.from("S"), cstr("ERROR"),
          Buffer.from("C"), cstr(code),
          Buffer.from("M"), cstr(message),
          Buffer.from([0]),
        ])
      );
      w.msg("Z", Buffer.from("I"));
      w.flush(sock);
    };

    const readyIdle = (w: Writer) => w.msg("Z", Buffer.from("I"));

    sock.on("error", () => sock.destroy());

    sock.on("data", async (chunk) => {
      parser.push(chunk);

      // Handshake phase (startup / SSL request have no type byte).
      while (!authed) {
        const body = parser.takeStartup();
        if (!body) return;
        const code = body.readInt32BE(0);
        if (code === 80877103) {
          // SSLRequest — decline, client continues in cleartext.
          sock.write(Buffer.from("N"));
          continue;
        }
        if (code === 80877102) {
          // CancelRequest — ignore.
          sock.destroy();
          return;
        }
        // StartupMessage: parse parameter key/value pairs.
        let offset = 4;
        const params: Record<string, string> = {};
        while (offset < body.length) {
          if (body[offset] === 0) break;
          const k = readCString(body, offset);
          const v = readCString(body, k.offset);
          params[k.value] = v.value;
          offset = v.offset;
        }
        dbName = params.database || params.user || "";
        try {
          const resolved = await this.manager.handleForConnection(dbName);
          if (!resolved) {
            fail(`database "${dbName}" does not exist`, "3D000");
            sock.destroy();
            return;
          }
          dbId = resolved.id;
          handle = resolved.handle;
        } catch (e) {
          fail(e instanceof Error ? e.message : String(e));
          sock.destroy();
          return;
        }
        authed = true;
        const w = new Writer();
        w.msg("R", int32(0)); // AuthenticationOk (trust)
        for (const [k, v] of Object.entries({
          server_version: "15.0 (poopabase)",
          server_encoding: "UTF8",
          client_encoding: "UTF8",
          DateStyle: "ISO, MDY",
          standard_conforming_strings: "on",
        })) {
          w.msg("S", Buffer.concat([cstr(k), cstr(v)]));
        }
        w.msg("K", Buffer.concat([int32(1), int32(0)])); // BackendKeyData
        readyIdle(w);
        w.flush(sock);
      }

      // Command phase.
      let m: { type: string; body: Buffer } | null;
      while ((m = parser.takeMessage())) {
        try {
          await this.handleMessage(m, sock, {
            getHandle: () => handle!,
            getDbId: () => dbId!,
            prepared,
            portals,
          });
        } catch (e) {
          fail(e instanceof Error ? e.message : String(e));
        }
      }
    });
  }

  private async handleMessage(
    m: { type: string; body: Buffer },
    sock: net.Socket,
    ctx: {
      getHandle: () => Database.Database;
      getDbId: () => string;
      prepared: Map<string, PreparedStatement>;
      portals: Map<string, Portal>;
    }
  ) {
    const w = new Writer();
    switch (m.type) {
      case "Q": {
        // Simple query.
        const { value: sql } = readCString(m.body, 0);
        if (!sql.trim()) {
          w.msg("I", Buffer.alloc(0));
          w.msg("Z", Buffer.from("I"));
          w.flush(sock);
          return;
        }
        this.runInto(w, ctx.getHandle(), ctx.getDbId(), sql, []);
        w.msg("Z", Buffer.from("I"));
        w.flush(sock);
        return;
      }
      case "P": {
        // Parse: name, query, paramTypes
        const name = readCString(m.body, 0);
        const query = readCString(m.body, name.offset);
        ctx.prepared.set(name.value, { sql: query.value });
        w.msg("1", Buffer.alloc(0)); // ParseComplete
        w.flush(sock);
        return;
      }
      case "B": {
        // Bind: portal, statement, [formats], [params], [resultFormats]
        let o = 0;
        const portal = readCString(m.body, o); o = portal.offset;
        const stmt = readCString(m.body, o); o = stmt.offset;
        const nFormats = m.body.readInt16BE(o); o += 2;
        const formats: number[] = [];
        for (let i = 0; i < nFormats; i++) { formats.push(m.body.readInt16BE(o)); o += 2; }
        const nParams = m.body.readInt16BE(o); o += 2;
        const params: (string | null)[] = [];
        for (let i = 0; i < nParams; i++) {
          const len = m.body.readInt32BE(o); o += 4;
          if (len === -1) { params.push(null); }
          else { params.push(m.body.toString("utf8", o, o + len)); o += len; }
        }
        // trailing result formats ignored (we always emit text)
        const ps = ctx.prepared.get(stmt.value);
        if (!ps) throw new Error(`prepared statement "${stmt.value}" does not exist`);
        ctx.portals.set(portal.value, { sql: ps.sql, params });
        w.msg("2", Buffer.alloc(0)); // BindComplete
        w.flush(sock);
        return;
      }
      case "D": {
        // Describe: 'S' statement or 'P' portal
        const kind = String.fromCharCode(m.body[0]);
        const name = readCString(m.body, 1).value;
        const sql = kind === "S" ? ctx.prepared.get(name)?.sql : ctx.portals.get(name)?.sql;
        if (sql == null) throw new Error("describe: not found");
        if (kind === "S") w.msg("t", int16(0)); // ParameterDescription (0 declared)
        const desc = this.describe(ctx.getHandle(), sql);
        if (desc) w.raw(rowDescription(desc));
        else w.msg("n", Buffer.alloc(0)); // NoData
        w.flush(sock);
        return;
      }
      case "E": {
        // Execute: portal, maxRows
        const portal = readCString(m.body, 0);
        const p = ctx.portals.get(portal.value);
        if (!p) throw new Error(`portal "${portal.value}" does not exist`);
        this.runInto(w, ctx.getHandle(), ctx.getDbId(), p.sql, p.params, /*withRowDesc*/ false);
        w.flush(sock);
        return;
      }
      case "S": {
        // Sync
        w.msg("Z", Buffer.from("I"));
        w.flush(sock);
        return;
      }
      case "C": {
        // Close statement/portal
        const kind = String.fromCharCode(m.body[0]);
        const name = readCString(m.body, 1).value;
        if (kind === "S") ctx.prepared.delete(name);
        else ctx.portals.delete(name);
        w.msg("3", Buffer.alloc(0)); // CloseComplete
        w.flush(sock);
        return;
      }
      case "H": {
        // Flush
        w.flush(sock);
        return;
      }
      case "X": {
        sock.end();
        return;
      }
      default:
        return;
    }
  }

  /** Prepare a statement to learn its result columns (for Describe). */
  private describe(handle: Database.Database, sql: string): { name: string; oid: number }[] | null {
    const stmt = handle.prepare(sql.trim());
    if (!stmt.reader) return null;
    return stmt.columns().map((c) => ({ name: c.name, oid: oidForSqliteType(c.type) }));
  }

  /** Execute SQL and append RowDescription/DataRow/CommandComplete to the writer. */
  private runInto(
    w: Writer,
    handle: Database.Database,
    dbId: string,
    sql: string,
    params: (string | null)[],
    withRowDesc = true
  ) {
    const trimmed = sql.trim().replace(/;\s*$/, "");
    let stmt;
    try {
      stmt = handle.prepare(trimmed);
    } catch (e) {
      // Fall back to multi-statement exec (no result set).
      handle.exec(sql);
      this.afterWrite(dbId);
      w.msg("C", cstr("OK"));
      return;
    }
    const args = params as unknown[];
    if (stmt.reader) {
      const cols = stmt.columns().map((c) => ({ name: c.name, oid: oidForSqliteType(c.type) }));
      if (withRowDesc) w.raw(rowDescription(cols));
      const rows = stmt.raw().all(...args) as unknown[][];
      for (const row of rows) {
        const encoded = row.map(encodeValue);
        const total = encoded.reduce((n, b) => n + 4 + (b ? b.length : 0), 0);
        const body = Buffer.alloc(2 + total);
        let o = 0;
        body.writeInt16BE(encoded.length, o); o += 2;
        for (const b of encoded) {
          if (b === null) { body.writeInt32BE(-1, o); o += 4; }
          else { body.writeInt32BE(b.length, o); o += 4; b.copy(body, o); o += b.length; }
        }
        w.msg("D", body);
      }
      w.msg("C", cstr(`SELECT ${rows.length}`));
    } else {
      const info = stmt.run(...args);
      this.afterWrite(dbId);
      const verb = trimmed.split(/\s+/)[0].toUpperCase();
      let tag: string;
      if (verb === "INSERT") tag = `INSERT 0 ${info.changes}`;
      else if (verb === "UPDATE") tag = `UPDATE ${info.changes}`;
      else if (verb === "DELETE") tag = `DELETE ${info.changes}`;
      else tag = verb || "OK";
      w.msg("C", cstr(tag));
    }
  }

  private afterWrite(dbId: string) {
    this.manager.touch(dbId);
    this.manager.sync(dbId).catch(() => {});
  }
}

function int32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n, 0);
  return b;
}
function int16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeInt16BE(n, 0);
  return b;
}

function rowDescription(cols: { name: string; oid: number }[]): Buffer {
  const parts: Buffer[] = [int16(cols.length)];
  for (const c of cols) {
    const size = c.oid === OID_INT8 ? 8 : c.oid === OID_FLOAT8 ? 8 : c.oid === OID_BOOL ? 1 : -1;
    const meta = Buffer.alloc(18);
    let o = 0;
    meta.writeInt32BE(0, o); o += 4; // table oid
    meta.writeInt16BE(0, o); o += 2; // column attr
    meta.writeInt32BE(c.oid, o); o += 4; // type oid
    meta.writeInt16BE(size, o); o += 2; // type size
    meta.writeInt32BE(-1, o); o += 4; // type modifier
    meta.writeInt16BE(0, o); o += 2; // format text
    parts.push(cstr(c.name), meta);
  }
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(5);
  header.writeUInt8("T".charCodeAt(0), 0);
  header.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([header, body]);
}
