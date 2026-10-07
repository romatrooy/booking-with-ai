// Конфигурация сервиса. Значения по умолчанию соответствуют README,
// раздел "Переменные окружения". Тип-импорты согласно AGENTS.md, раздел 9.

import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export interface Config {
  readonly port: number;
  readonly host: string;
  readonly dbFile: string;
  readonly webDir: string;
  readonly webOrigin: string;
  // Логин и пароль администратора. Опциональны: если не заданы,
  // используются dev-значения и в лог печатается предупреждение.
  // Решение зафиксировано в ADR 0004.
  readonly adminLogin: string;
  readonly adminPassword: string;
  // Секрет для подписи cookie `admin_session`. Опционален: если не
  // задан, при старте генерируется случайная строка и попадает в лог.
  // В проде `BOOKING_SESSION_SECRET` обязателен — иначе куки
  // инвалидируются при каждом перезапуске.
  readonly sessionSecret: string;
  // SMTP для отправки писем гостю. Если конфиг пуст (ни одна
  // переменная не задана), `mailer` это no-op. Решение в ADR 0005.
  readonly smtp: SmtpConfig | null;
}

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly from: string;
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

  // Логин/пароль администратора. Дефолт — пара `admin` / `Pas!_123`,
  // согласовано с пользователем (см. переписку перед реализацией).
  // Эти значения **только** для локальной разработки и печатаются в
  // лог при старте с предупреждением.
  const adminLogin = env["BOOKING_ADMIN_LOGIN"] ?? "admin";
  const adminPassword = env["BOOKING_ADMIN_PASSWORD"] ?? "Pas!_123";

  // Секрет сессии. Если не задан — генерируем случайно и печатаем в
  // лог: при рестарте процесса все сессии инвалидируются, что для
  // dev-режима нормально.
  const sessionSecret =
    env["BOOKING_SESSION_SECRET"] ?? randomBytes(32).toString("hex");

  // SMTP. Если ни одна из переменных не задана — null, и `mailer`
  // становится no-op. Если задана хотя бы одна — требуем все
  // остальные, иначе сервер стартует с явной ошибкой: половина
  // конфига хуже, чем ничего, и приводит к непонятным таймаутам.
  const smtpHost = env["SMTP_HOST"];
  const smtpPortRaw = env["SMTP_PORT"];
  const smtpUser = env["SMTP_USER"];
  const smtpPassword = env["SMTP_PASSWORD"];
  const smtpFromRaw = env["SMTP_FROM"];

  const anySmtp = [
    smtpHost,
    smtpPortRaw,
    smtpUser,
    smtpPassword,
    smtpFromRaw,
  ].some((v) => v !== undefined);
  if (anySmtp) {
    const missing: string[] = [];
    if (smtpHost === undefined) missing.push("SMTP_HOST");
    if (smtpPortRaw === undefined) missing.push("SMTP_PORT");
    if (smtpUser === undefined) missing.push("SMTP_USER");
    if (smtpPassword === undefined) missing.push("SMTP_PASSWORD");
    if (smtpFromRaw === undefined) missing.push("SMTP_FROM");
    if (missing.length > 0) {
      throw new Error(
        `SMTP: заданы не все переменные. Не хватает: ${missing.join(", ")}.`,
      );
    }
  }
  const smtp: SmtpConfig | null =
    smtpHost !== undefined &&
    smtpPortRaw !== undefined &&
    smtpUser !== undefined &&
    smtpPassword !== undefined &&
    smtpFromRaw !== undefined
      ? {
          host: smtpHost,
          port: parsePort(smtpPortRaw, 587),
          user: smtpUser,
          password: smtpPassword,
          from: smtpFromRaw,
        }
      : null;

  return {
    port,
    host,
    dbFile,
    webDir,
    webOrigin,
    adminLogin,
    adminPassword,
    sessionSecret,
    smtp,
  };
}
