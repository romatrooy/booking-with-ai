// Конфигурация Playwright для e2e/.
//
// Тесты поднимают собранный сервис через `webServer`: сначала
// `npm run build` (собирает server и web), затем `npm start`
// (запускает server, который раздаёт web из web/dist на 8000).
// Если сервис уже запущен — Playwright использует его.
//
// `npm -C <dir> run build` — это флаг npm 7+, который говорит
// «выполни команду в указанной директории, не в CWD». Путь
// вычисляется через `import.meta.url`. ВАЖНО: Playwright
// переопределяет CWD при запуске webServer на `e2e/..`, поэтому
// `import.meta.url` указывает на этот каталог, а не на `e2e/`.
// Поднимаемся вверх на 1 уровень, чтобы получить путь к корню.

import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const runnerPath = resolve(here, "..", "e2e", "server-runner.mjs");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: process.env["CI"]
    ? [["list"], ["html", { open: "never" }]]
    : "list",
  // Сервис должен слушать 8000 (см. server/src/config.ts: BOOKING_PORT).
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Запускаем `server-runner.mjs` напрямую через node. Это
    // обходит проблему с PowerShell-обёрткой npm в Windows и не
    // требует формирования сложных shell-команд. Скрипт сам
    // вызывает `npm run build` и `npm start` с правильным CWD.
    // Playwright стартует webServer из директории `e2e/..` (на один
    // уровень выше e2e/), поэтому путь к скрипту — относительно
    // этой точки. `repoRoot` (на два уровня выше e2e/) — это
    // `C:\Users\roman\AI_DEV\booking-sevice`. Скрипт лежит в
    // `e2e/server-runner.mjs` относительно корня.
    command: `node "${runnerPath}"`,
    url: "http://127.0.0.1:8000",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
