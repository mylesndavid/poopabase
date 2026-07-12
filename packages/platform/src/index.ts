import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Manager } from "./lib/manager.js";
import { registerRoutes } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.POOPABASE_DATA || path.join(process.cwd(), ".poopabase-data");
const PORT = Number(process.env.PORT || 4000);

async function main() {
  const manager = new Manager(DATA_DIR);
  await manager.start();

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  registerRoutes(app, manager);

  // Serve the built dashboard if present.
  const webDist = path.resolve(__dirname, "../../web/dist");
  if (fs.existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api")) return reply.code(404).send({ error: "not found" });
      return reply.sendFile("index.html");
    });
  }

  app.get("/health", async () => ({ ok: true, dataDir: DATA_DIR, bucket: manager.bucket.location }));

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`\n  💩 poopabase platform`);
  console.log(`  ├─ api      http://localhost:${PORT}/api`);
  console.log(`  ├─ data     ${DATA_DIR}`);
  console.log(`  └─ bucket   ${manager.bucket.location}\n`);

  const shutdown = async () => {
    await manager.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
