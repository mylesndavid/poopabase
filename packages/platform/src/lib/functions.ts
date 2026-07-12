import vm from "node:vm";

export interface FunctionContext {
  query: (sql: string, params?: unknown[]) => unknown;
  log: (...args: unknown[]) => void;
  input: unknown;
}

/**
 * Execute a poopabase server function. Functions are plain JS with access to a
 * `db` handle (synchronous SQL against their own database), a `console` that is
 * captured into run logs, and the invocation `input`. The body may `return` a
 * JSON-serializable result.
 *
 * Runs inside a fresh V8 context with no access to require/process/globals —
 * enough isolation for a local dev platform. Production hosting would move this
 * to a hardened isolate (workerd / V8 isolates).
 */
export async function runFunction(code: string, ctx: FunctionContext): Promise<unknown> {
  const sandbox = {
    db: { query: ctx.query },
    console: { log: ctx.log, error: ctx.log, warn: ctx.log, info: ctx.log },
    input: ctx.input,
    JSON,
    Date,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
  };
  const context = vm.createContext(sandbox);
  const wrapped = `(async () => { ${code}\n })()`;
  const script = new vm.Script(wrapped, { filename: "function.js" });
  const result = await script.runInContext(context, { timeout: 10000 });
  return result;
}
