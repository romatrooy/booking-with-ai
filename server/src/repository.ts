// Единственное место с SQL. AGENTS.md, раздел 5:
// "server/src/repository.ts — единственное место с SQL".
// AGENTS.md, раздел 9: "В обработчиках маршрутов SQL нет".
//
// API репозитория принимает и возвращает обычные объекты (то, что
// отдаёт Zod), а не «сырые» строки `better-sqlite3`. Это позволяет
// обрабатывать данные на уровне JS (JSON-декодирование, форматирование)
// здесь, в одном месте, а не размазывать по обработчикам.

import type { Db } from "./db.ts";
import type { Activity, Booking, Schedule } from "./schemas.ts";
import type { BusySlot } from "./slotEngine.ts";
import { weekdaysFromJson, weekdaysToJson } from "./slotEngine.ts";

// ─── Activities ─────────────────────────────────────────────────────────────

interface ActivityRow {
  id: number;
  name: string;
  description: string | null;
  default_duration_minutes: number;
}

function rowToActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    default_duration_minutes: row.default_duration_minutes,
  };
}

export function listActivities(db: Db): Activity[] {
  const stmt = db.prepare<[], ActivityRow>(
    "SELECT id, name, description, default_duration_minutes FROM activities ORDER BY id ASC",
  );
  return stmt.all().map(rowToActivity);
}

export function getActivity(db: Db, id: number): Activity | null {
  const stmt = db.prepare<[number], ActivityRow>(
    "SELECT id, name, description, default_duration_minutes FROM activities WHERE id = ?",
  );
  const row = stmt.get(id);
  return row ? rowToActivity(row) : null;
}

export function insertActivity(
  db: Db,
  data: {
    name: string;
    description: string | null;
    default_duration_minutes: number;
  },
): Activity {
  const stmt = db.prepare<[string, string | null, number], ActivityRow>(
    "INSERT INTO activities (name, description, default_duration_minutes) VALUES (?, ?, ?) RETURNING id, name, description, default_duration_minutes",
  );
  const row = stmt.get(
    data.name,
    data.description,
    data.default_duration_minutes,
  );
  if (!row) {
    throw new Error("insertActivity: не удалось прочитать RETURNING");
  }
  return rowToActivity(row);
}

// ─── Schedules ──────────────────────────────────────────────────────────────

interface ScheduleRow {
  id: number;
  activity_id: number;
  weekdays: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
}

function rowToSchedule(row: ScheduleRow): Schedule {
  // Zod уже проверил содержимое `weekdays` при создании расписания, и
  // `SCHEMA` (CHECK-ограничения) гарантирует, что в БД лежит массив
  // строк. Поэтому приведение `string[]` к литеральному union безопасно.
  return {
    id: row.id,
    activity_id: row.activity_id,
    weekdays: weekdaysFromJson(row.weekdays) as Schedule["weekdays"],
    start_time: row.start_time,
    end_time: row.end_time,
    duration_minutes: row.duration_minutes,
  };
}

export function listSchedules(db: Db, activityId?: number): Schedule[] {
  if (activityId !== undefined) {
    const stmt = db.prepare<[number], ScheduleRow>(
      "SELECT id, activity_id, weekdays, start_time, end_time, duration_minutes FROM schedules WHERE activity_id = ? ORDER BY id ASC",
    );
    return stmt.all(activityId).map(rowToSchedule);
  }
  const stmt = db.prepare<[], ScheduleRow>(
    "SELECT id, activity_id, weekdays, start_time, end_time, duration_minutes FROM schedules ORDER BY id ASC",
  );
  return stmt.all().map(rowToSchedule);
}

export function insertSchedule(
  db: Db,
  data: {
    activity_id: number;
    weekdays: readonly string[];
    start_time: string;
    end_time: string;
    duration_minutes: number;
  },
): Schedule {
  const stmt = db.prepare<
    [number, string, string, string, number],
    ScheduleRow
  >(
    "INSERT INTO schedules (activity_id, weekdays, start_time, end_time, duration_minutes) VALUES (?, ?, ?, ?, ?) RETURNING id, activity_id, weekdays, start_time, end_time, duration_minutes",
  );
  const row = stmt.get(
    data.activity_id,
    weekdaysToJson(data.weekdays),
    data.start_time,
    data.end_time,
    data.duration_minutes,
  );
  if (!row) {
    throw new Error("insertSchedule: не удалось прочитать RETURNING");
  }
  return rowToSchedule(row);
}

// ─── Bookings ───────────────────────────────────────────────────────────────

interface BookingRow {
  id: number;
  activity_id: number;
  date: string;
  start_time: string;
  guest_name: string;
  guest_email: string;
  status: "active" | "cancelled";
  created_at: string;
}

function rowToBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    activity_id: row.activity_id,
    date: row.date,
    start_time: row.start_time,
    guest_name: row.guest_name,
    guest_email: row.guest_email,
    status: row.status,
    created_at: row.created_at,
  };
}

export function listBookings(db: Db, guestEmail?: string): Booking[] {
  if (guestEmail !== undefined) {
    const stmt = db.prepare<[string], BookingRow>(
      "SELECT id, activity_id, date, start_time, guest_name, guest_email, status, created_at FROM bookings WHERE guest_email = ? ORDER BY id ASC",
    );
    return stmt.all(guestEmail).map(rowToBooking);
  }
  const stmt = db.prepare<[], BookingRow>(
    "SELECT id, activity_id, date, start_time, guest_name, guest_email, status, created_at FROM bookings ORDER BY id ASC",
  );
  return stmt.all().map(rowToBooking);
}

export function getBooking(db: Db, id: number): Booking | null {
  const stmt = db.prepare<[number], BookingRow>(
    "SELECT id, activity_id, date, start_time, guest_name, guest_email, status, created_at FROM bookings WHERE id = ?",
  );
  const row = stmt.get(id);
  return row ? rowToBooking(row) : null;
}

interface InsertBookingData {
  activity_id: number;
  date: string;
  start_time: string;
  guest_name: string;
  guest_email: string;
}

// `insertBooking` — единственная функция, которая бросает
// `SqliteError` при нарушении `uq_active_booking`. Обработчик в
// `routes/bookings.ts` ловит её и превращает в `ApiError("slot_taken")`.
// Не делаем здесь throw `ApiError` — это утечка слоя репозитория в
// доменный код, плюс unit-тесты `repository.test.ts` становятся
// зависимыми от `errors.ts`.
export function insertBooking(db: Db, data: InsertBookingData): Booking {
  const stmt = db.prepare<[number, string, string, string, string], BookingRow>(
    "INSERT INTO bookings (activity_id, date, start_time, guest_name, guest_email) VALUES (?, ?, ?, ?, ?) RETURNING id, activity_id, date, start_time, guest_name, guest_email, status, created_at",
  );
  const row = stmt.get(
    data.activity_id,
    data.date,
    data.start_time,
    data.guest_name,
    data.guest_email,
  );
  if (!row) {
    throw new Error("insertBooking: не удалось прочитать RETURNING");
  }
  return rowToBooking(row);
}

// Атомарный переход в `cancelled` через `WHERE id = ? AND status = 'active'`.
// Возвращает обновлённую бронь или `null`, если бронь не найдена или уже
// отменена. Это позволяет обработчику понять причину и не делать
// дополнительный SELECT.
export function cancelBooking(db: Db, id: number): Booking | null {
  const stmt = db.prepare<[number], BookingRow>(
    "UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status = 'active' RETURNING id, activity_id, date, start_time, guest_name, guest_email, status, created_at",
  );
  const row = stmt.get(id);
  return row ? rowToBooking(row) : null;
}

// Занятые слоты в указанном диапазоне дат для конкретной активности.
// Используется движком слотов, чтобы отсеять уже забронированные окна.
export function listBusySlots(
  db: Db,
  activityId: number,
  dateFrom: string,
  dateTo: string,
): BusySlot[] {
  const stmt = db.prepare<[number, string, string], BusySlot>(
    "SELECT activity_id, date, start_time FROM bookings WHERE activity_id = ? AND status = 'active' AND date BETWEEN ? AND ?",
  );
  return stmt.all(activityId, dateFrom, dateTo);
}
