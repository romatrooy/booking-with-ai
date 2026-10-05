// Подключение к SQLite и описание схемы. AGENTS.md, раздел 5:
// "server/src/db.ts — подключение к SQLite, схема таблиц, индексы".
// AGENTS.md, раздел 9: "Внутри кода имена в стиле camelCase".
// Поля таблиц названы в `snake_case` — так они приходят из API и контракта
// (`contract/main.tsp`).

import Database from "better-sqlite3";

export type Db = Database.Database;

// SQL-схема применяется при открытии базы. В проекте нет миграций
// (AGENTS.md §11, "Добавить поле в модель": "удаляем booking.db"). Схема
// идемпотентна: `CREATE ... IF NOT EXISTS`. В учебном проекте этого
// достаточно: при изменении модели разработчик удаляет файл и заново
// запускает `npm run seed`.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  default_duration_minutes INTEGER NOT NULL CHECK (default_duration_minutes BETWEEN 5 AND 480)
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  -- Дни недели хранятся как JSON-массив строк 'mon', 'tue', ...
  -- (см. enum Weekday в contract/main.tsp). JSON выбран потому, что
  -- массив в SQLite не имеет типа, а перенос в отдельную таблицу для
  -- 7 значений был бы лишним.
  weekdays TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480)
);

CREATE INDEX IF NOT EXISTS idx_schedules_activity_id ON schedules(activity_id);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Главное правило сервиса (онтология, И1): на один слот не более одной
-- действующей брони. Это второй рубеж защиты — подробнее в
-- docs/adr/0003-zashchita-ot-dvoynogo-bronirovaniya.md. Частичный
-- индекс действует только на строки со статусом 'active': отменённая
-- бронь не мешает создать новую на тот же слот.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_booking
  ON bookings(activity_id, date, start_time)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_bookings_guest_email ON bookings(guest_email);
CREATE INDEX IF NOT EXISTS idx_bookings_activity_date ON bookings(activity_id, date);
`;

export function openDb(file: string): Db {
  const db = new Database(file);
  // WAL — на каждой записи создаётся отдельный лог-файл, и читатели не
  // блокируют писателя. Включаем явно: по умолчанию в SQLite WAL выключен.
  db.pragma("journal_mode = WAL");
  // Чуть строже к внешним ключам: по умолчанию SQLite не проверяет их.
  // В нашей схеме есть `REFERENCES activities(id) ON DELETE CASCADE`, и
  // без этой прагмы он просто игнорируется.
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
