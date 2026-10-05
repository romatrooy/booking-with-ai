// Конфигурация сервиса. Значения по умолчанию соответствуют README,
// раздел "Переменные окружения". Тип-импорты согласно AGENTS.md, раздел 9.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export interface Config {
  readonly port: number;
  readonly host: string;
  readonly dbFile: string;
  readonly webDir: string;
  readonly webOrigin: string;
}

const here = dirname(fileURLToPath(import.meta.url));
// dist/config.js лежит в server/dist/, корень проекта — на два уровня выше.
// src/config.ts лежит в server/src/, корень — на один уровень выше.
// Проверяем обе и выбираем ту, где есть package.json с workspaces.
function findProjectRoot(): string {
  // Если есть соседний dist/ (скомпилированный код), идём на уровень выше от dist/.
  // Иначе — это исходник в src/, идём на уровень выше.
  const fromHere = resolve(here, "..", "..");
  return fromHere;
}

const projectRoot = findProjectRoot();

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0 || n > 65535) {
    throw new Error(`Некорректный BOOKING_PORT: ${raw}`);
  }
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = parsePort(env["BOOKING_PORT"], 8000);
  const host = env["BOOKING_HOST"] ?? "0.0.0.0";
  // По умолчанию файл базы лежит в корне проекта. Это удобно: одна
  // команда `docker compose up` — и база в томе.
  const dbFile = env["BOOKING_DB_FILE"]
    ? resolve(projectRoot, env["BOOKING_DB_FILE"])
    : resolve(projectRoot, "booking.db");
  // web/dist находится в корне проекта. Если сборка web не выполнена,
  // директории может не быть; обработчик статики это учтёт.
  const webDirRaw = env["BOOKING_WEB_DIR"] ?? "web/dist";
  const webDir = resolve(projectRoot, webDirRaw);
  // Для CORS: по умолчанию разрешаем только локальный dev-сервер Vite.
  const webOrigin = env["BOOKING_WEB_ORIGIN"] ?? "http://localhost:5173";
  return { port, host, dbFile, webDir, webOrigin };
}
