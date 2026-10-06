// Демо-данные. AGENTS.md, раздел 5:
// "server/src/seed.ts — демонстрационные данные".
//
// Запускается через `npm run seed` (см. `server/package.json`).
// Идемпотентен: очищает таблицы и наполняет их заново. Это удобно
// для разработки и для e2e-тестов.
//
// Реализация написана на чистом JavaScript, а не на TypeScript. Причина:
// при комбинации `tsx` + `better-sqlite3@12` esbuild иногда теряет
// сигнатуру `Statement.run` и приводит её к `run()` без аргументов —
// `better-sqlite3` бросает "Too few parameter values". Через чистый
// `require()` и `Statement` этого не происходит. Когда в проекте
// появится `build` шаг с компиляцией через `tsc --build` и `node`
// будет запускать `.js` напрямую, это ограничение исчезнет.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

function seed() {
  // БД лежит в корне проекта, рядом с `server/`. Это удобно для
  // `docker compose up -v` — том для данных. Путь берётся из
  // переменной `BOOKING_DB_FILE` (относительно корня проекта) либо
  // по умолчанию `booking.db` в корне. Так seed и сервер ходят в один
  // и тот же файл, что важно в Docker: том монтируется в `/data`, и
  // оба процесса должны видеть базу по одному пути.
  const here = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(here, "..", "..");
  const raw = process.env["BOOKING_DB_FILE"];
  const dbFile = raw ? resolve(projectRoot, raw) : resolve(projectRoot, "booking.db");

  if (existsSync(dbFile)) {
    // Не удаляем файл целиком (на Windows он может быть залочен
    // предыдущим процессом, и `unlinkSync` бросит EBUSY). Вместо
    // этого открываем файл, дропаем все таблицы, чтобы очистить
    // данные, и закрываем.
    const cleanup = new Database(dbFile);
    cleanup.exec(`
      DROP TABLE IF EXISTS bookings;
      DROP TABLE IF EXISTS schedules;
      DROP TABLE IF EXISTS activities;
    `);
    cleanup.close();
  }
  const db = new Database(dbFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Простая схема, повторяющая `server/src/db.ts` без `IF NOT EXISTS`
  // (здесь мы создаём базу с нуля, так что проверки не нужны).
  db.exec(`
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      default_duration_minutes INTEGER NOT NULL CHECK (default_duration_minutes BETWEEN 5 AND 480)
    );
    CREATE TABLE schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      weekdays TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480)
    );
    CREATE INDEX idx_schedules_activity_id ON schedules(activity_id);
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      guest_email TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'cancelled')) DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE UNIQUE INDEX uq_active_booking
      ON bookings(activity_id, date, start_time)
      WHERE status = 'active';
    CREATE INDEX idx_bookings_guest_email ON bookings(guest_email);
    CREATE INDEX idx_bookings_activity_date ON bookings(activity_id, date);
  `);

  // Две активности. Длительность по умолчанию — час и полчаса.
  const insertActivity = db.prepare(
    "INSERT INTO activities (name, description, default_duration_minutes) VALUES (?, ?, ?) RETURNING id",
  );
  const consultationId = insertActivity.get(
    "Консультация",
    "Личная встреча по вопросам учебного проекта",
    60,
  ).id;
  const codeReviewId = insertActivity.get(
    "Код-ревью",
    "Разбор присланного PR с комментариями",
    30,
  ).id;

  // Одно расписание на «Консультацию» (по будням с 10 до 12, слот 60 мин).
  const insertScheduleStmt = db.prepare(
    "INSERT INTO schedules (activity_id, weekdays, start_time, end_time, duration_minutes) VALUES (?, ?, ?, ?, ?)",
  );
  insertScheduleStmt.run(
    consultationId,
    JSON.stringify(["mon", "tue", "wed", "thu", "fri"]),
    "10:00:00",
    "12:00:00",
    60,
  );

  // Другое расписание на «Код-ревью» (по средам с 18 до 20, слот 30 мин).
  insertScheduleStmt.run(
    codeReviewId,
    JSON.stringify(["wed"]),
    "18:00:00",
    "20:00:00",
    30,
  );

  console.log(`База наполнена: ${dbFile}`);
  console.log(`  Активность #${consultationId}: Консультация`);
  console.log(`  Активность #${codeReviewId}: Код-ревью`);
}

seed();
