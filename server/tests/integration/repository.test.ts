// Интеграционные тесты для server/src/repository.ts. Используют
// настоящую SQLite, но во временной in-memory базе — каждый тест
// получает свежую БД через openDb(":memory:") с применённой SCHEMA.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Db, openDb } from "../../src/db.ts";
import { SqliteError } from "better-sqlite3";
import {
  cancelBooking,
  getActivity,
  getBooking,
  insertActivity,
  insertBooking,
  insertSchedule,
  listActivities,
  listBookings,
  listBusySlots,
  listSchedules,
} from "../../src/repository.ts";

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
});

afterEach(() => {
  db.close();
});

describe("activities", () => {
  it("insertActivity возвращает активность с id", () => {
    const a = insertActivity(db, {
      name: "Консультация",
      description: null,
      default_duration_minutes: 60,
    });
    expect(a.id).toBeTypeOf("number");
    expect(a.name).toBe("Консультация");
    expect(a.default_duration_minutes).toBe(60);
    expect(a.description).toBeNull();
  });

  it("listActivities возвращает все в порядке id ASC", () => {
    const a = insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 30,
    });
    const b = insertActivity(db, {
      name: "B",
      description: null,
      default_duration_minutes: 60,
    });
    const list = listActivities(db);
    expect(list.map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it("getActivity возвращает null для несуществующего", () => {
    expect(getActivity(db, 999)).toBeNull();
  });

  it("CHECK-ограничение не даёт вставить duration_minutes вне 5..480", () => {
    expect(() =>
      insertActivity(db, {
        name: "x",
        description: null,
        default_duration_minutes: 1,
      }),
    ).toThrow();
    expect(() =>
      insertActivity(db, {
        name: "x",
        description: null,
        default_duration_minutes: 481,
      }),
    ).toThrow();
  });
});

describe("schedules", () => {
  it("insertSchedule хранит weekdays как JSON и читает обратно", () => {
    const activity = insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 60,
    });
    const s = insertSchedule(db, {
      activity_id: activity.id,
      weekdays: ["mon", "wed"],
      start_time: "10:00:00",
      end_time: "12:00:00",
      duration_minutes: 60,
    });
    expect(s.weekdays).toEqual(["mon", "wed"]);
    const raw = db
      .prepare("SELECT weekdays FROM schedules WHERE id = ?")
      .get(s.id) as { weekdays: string };
    expect(JSON.parse(raw.weekdays)).toEqual(["mon", "wed"]);
  });

  it("listSchedules фильтрует по activity_id", () => {
    const a = insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 60,
    });
    const b = insertActivity(db, {
      name: "B",
      description: null,
      default_duration_minutes: 30,
    });
    insertSchedule(db, {
      activity_id: a.id,
      weekdays: ["mon"],
      start_time: "10:00:00",
      end_time: "11:00:00",
      duration_minutes: 60,
    });
    insertSchedule(db, {
      activity_id: b.id,
      weekdays: ["tue"],
      start_time: "18:00:00",
      end_time: "19:00:00",
      duration_minutes: 30,
    });
    expect(listSchedules(db)).toHaveLength(2);
    expect(listSchedules(db, a.id)).toHaveLength(1);
    expect(listSchedules(db, b.id)).toHaveLength(1);
  });

  it("ON DELETE CASCADE удаляет расписания при удалении активности", () => {
    const a = insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 60,
    });
    insertSchedule(db, {
      activity_id: a.id,
      weekdays: ["mon"],
      start_time: "10:00:00",
      end_time: "11:00:00",
      duration_minutes: 60,
    });
    db.prepare("DELETE FROM activities WHERE id = ?").run(a.id);
    expect(listSchedules(db, a.id)).toHaveLength(0);
  });

  it("FK не даёт вставить расписание на несуществующую активность", () => {
    expect(() =>
      insertSchedule(db, {
        activity_id: 999,
        weekdays: ["mon"],
        start_time: "10:00:00",
        end_time: "11:00:00",
        duration_minutes: 60,
      }),
    ).toThrow();
  });
});

describe("bookings", () => {
  function setupActivity() {
    return insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 60,
    });
  }

  it("insertBooking возвращает бронь со status='active'", () => {
    const a = setupActivity();
    const b = insertBooking(db, {
      activity_id: a.id,
      date: "2026-10-07",
      start_time: "10:00:00",
      guest_name: "Иван",
      guest_email: "ivan@example.com",
    });
    expect(b.status).toBe("active");
    expect(b.guest_name).toBe("Иван");
    expect(b.created_at).toBeTypeOf("string");
  });

  it("listBookings фильтрует по guest_email", () => {
    const a = setupActivity();
    insertBooking(db, {
      activity_id: a.id,
      date: "2026-10-07",
      start_time: "10:00:00",
      guest_name: "Иван",
      guest_email: "ivan@example.com",
    });
    insertBooking(db, {
      activity_id: a.id,
      date: "2026-10-07",
      start_time: "11:00:00",
      guest_name: "Пётр",
      guest_email: "petr@example.com",
    });
    expect(listBookings(db)).toHaveLength(2);
    expect(listBookings(db, "ivan@example.com")).toHaveLength(1);
  });

  it("cancelBooking переводит в cancelled, повторный cancel → null", () => {
    const a = setupActivity();
    const b = insertBooking(db, {
      activity_id: a.id,
      date: "2026-10-07",
      start_time: "10:00:00",
      guest_name: "Иван",
      guest_email: "ivan@example.com",
    });
    const cancelled = cancelBooking(db, b.id);
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelBooking(db, b.id)).toBeNull();
  });

  it("getBooking находит по id, null на несуществующем", () => {
    expect(getBooking(db, 999)).toBeNull();
    const a = setupActivity();
    const b = insertBooking(db, {
      activity_id: a.id,
      date: "2026-10-07",
      start_time: "10:00:00",
      guest_name: "Иван",
      guest_email: "ivan@example.com",
    });
    const got = getBooking(db, b.id);
    expect(got?.id).toBe(b.id);
  });
});

describe("invariant И1: на один слот не более одной действующей брони", () => {
  // AGENTS.md §10: «Не убирать частичный индекс `uq_active_booking` и
  // не заменять оба рубежа защиты одним.» Проверка, что индекс
  // действительно работает как второй рубеж.
  it("две активные брони на один слот — SqliteError UNIQUE", () => {
    const a = insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 60,
    });
    insertBooking(db, {
      activity_id: a.id,
      date: "2026-10-07",
      start_time: "10:00:00",
      guest_name: "Иван",
      guest_email: "ivan@example.com",
    });
    let thrown: unknown = null;
    try {
      insertBooking(db, {
        activity_id: a.id,
        date: "2026-10-07",
        start_time: "10:00:00",
        guest_name: "Пётр",
        guest_email: "petr@example.com",
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(SqliteError);
    expect((thrown as SqliteError).code).toBe("SQLITE_CONSTRAINT_UNIQUE");
  });

  it("отменённая бронь не блокирует повторное бронирование того же слота", () => {
    const a = insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 60,
    });
    const first = insertBooking(db, {
      activity_id: a.id,
      date: "2026-10-07",
      start_time: "10:00:00",
      guest_name: "Иван",
      guest_email: "ivan@example.com",
    });
    cancelBooking(db, first.id);
    const second = insertBooking(db, {
      activity_id: a.id,
      date: "2026-10-07",
      start_time: "10:00:00",
      guest_name: "Пётр",
      guest_email: "petr@example.com",
    });
    expect(second.id).toBeGreaterThan(first.id);
    expect(second.status).toBe("active");
  });

  it("listBusySlots отдаёт только active-брони", () => {
    const a = insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 60,
    });
    const b = insertBooking(db, {
      activity_id: a.id,
      date: "2026-10-07",
      start_time: "10:00:00",
      guest_name: "Иван",
      guest_email: "ivan@example.com",
    });
    cancelBooking(db, b.id);
    expect(listBusySlots(db, a.id, "2026-10-07", "2026-10-07")).toEqual([]);
  });
});
