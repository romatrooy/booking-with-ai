// Запускает собранный сервис. Используется Playwright как
// `webServer.command` вместо `npm start` напрямую, потому что
// `npm start` стартует процесс через PowerShell-обёртку, а
// Playwright не передаёт корректный CWD. Этот скрипт:
//
//   1. Переходит в корень репозитория;
//   2. Запускает `npm run build` (typecheck, т.к. в server/ пока
//      `noEmit: true`);
//   3. Запускает `npm start` (tsx src/index.ts) как дочерний процесс;
//   4. Перенаправляет stdout/stderr в этот процесс для логов;
//   5. При SIGINT/SIGTERM убивает дочерний процесс и сам выходит.
//
// Использование:
//   node e2e/server-runner.mjs
//
// Запускается из `playwright.config.ts` через webServer.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function run(cmd, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: true,
    });
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${cmd} ${args.join(" ")} завершился с кодом ${code}`));
    });
  });
}

async function main() {
  console.log(`[server-runner] CWD: ${repoRoot}`);
  // Шаг 1: build (= typecheck на текущем этапе).
  console.log("[server-runner] npm run build...");
  await run("npm", ["run", "build"]);

  // Шаг 2: запуск сервера через `node`, который сам подгружает
  // TypeScript через `tsx`. `tsx` — это ESM-загрузчик для Node,
  // и его можно запустить как `node --import tsx/esm script.ts`.
  // Это работает в любой оболочке, без PowerShell-обёртки.
  console.log("[server-runner] node --import tsx server/src/index.ts...");
  const server = spawn(
    process.execPath,
    [
      "--import",
      "tsx/esm",
      resolve(repoRoot, "server", "src", "index.ts"),
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        BOOKING_PORT: "8000",
        BOOKING_HOST: "127.0.0.1",
        BOOKING_DB_FILE: "booking.db",
      },
    },
  );

  // Пробрасываем сигналы завершения.
  const shutdown = (signal) => {
    console.log(`[server-runner] received ${signal}, killing server...`);
    server.kill(signal);
    setTimeout(() => process.exit(0), 200);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Ждём, пока сервис слушает порт.
  await new Promise((res) => setTimeout(res, 1500));

  // Держим процесс живым, пока не упадёт сервер.
  await new Promise((res) => {
    server.on("exit", (code) => {
      console.error(`[server-runner] server exited with code ${code}`);
      process.exit(code ?? 1);
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});