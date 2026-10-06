// Конфигурация Playwright для e2e/.
//
// Тесты поднимают собранный сервис через `webServer`. Сейчас
// `npm start` запускает `node dist/index.js` (а не `tsx`), и
// `node` нативно проходит через PowerShell-обёртку `npm.cmd`/
// `npm.ps1`. Поэтому `webServer.command` — это просто
// `npm run build && npm start`, а скрипт-обёртка не нужен.
//
// `npm -C <dir>` — флаг npm 7+, который говорит «выполни команду в
// указанной директории, не в CWD». Путь вычисляется через
// `import.meta.url`. ВАЖНО: Playwright переопределяет CWD при запуске
// webServer на `e2e/..`, поэтому `import.meta.url` указывает на этот
// каталог, а не на `e2e/`. Поднимаемся вверх на 1 уровень, чтобы
// получить путь к корню.

import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

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
    command: `npm -C "${repoRoot}" run build && npm -C "${repoRoot}" start`,
    url: "http://127.0.0.1:8000",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      // Используем отдельный файл БД, чтобы прогон e2e не
      // затирал основной `booking.db` в корне.
      BOOKING_DB_FILE: "booking-e2e.db",
    },
  },
});
