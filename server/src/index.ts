// Точка входа. AGENTS.md, раздел 5:
// "server/src/index.ts — точка входа".

import { openDb } from "./db.ts";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDb(config.dbFile);
  const app = await buildApp({ config, db });
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Сервис запущен на http://${config.host}:${config.port}`);
    app.log.info(`База данных: ${config.dbFile}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
