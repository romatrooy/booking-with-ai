// Сквозные тесты через `app.inject`. Они не поднимают порт, а
// вызывают обработчики напрямую через Fastify в тестовом режиме.
// Используется in-memory SQLite — каждый тест чистый.

import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../../src/db.ts";
import { buildApp } from "../../src/app.ts";
import type { Config } from "../../src/config.ts";
import { insertActivity, insertSchedule } from "../../src/repository.ts";
import { weekdaysToJson } from "../../src/slotEngine.ts";

let app: FastifyInstance;
let db: Db;

function makeConfig(): Config {
  return {
    port: 0,
    host: "127.0.0.1",
    dbFile: ":memory:",
    webDir: ".",
    webOrigin: "http://localhost:5173",
  };
}

async function seed(activityId: number) {
  insertSchedule(db, {
    activity_id: activityId,
    weekdays: ["wed"],
    start_time: "10:00:00",
    end_time: "12:00:00",
    duration_minutes: 60,
  });
  void weekdaysToJson;
}

beforeEach(async () => {
  db = openDb(":memory:");
  app = await buildApp({ config: makeConfig(), db });
});

afterEach(async () => {
  await app.close();
  db.close();
});

describe("activities", () => {
  it("GET /api/activities возвращает [] для пустой БД", async () => {
    const res = await app.inject({ method: "GET", url: "/api/activities" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("POST /api/activities создаёт активность и возвращает 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/activities",
      payload: {
        name: "Консультация",
        description: "Описание",
        default_duration_minutes: 60,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeTypeOf("number");
    expect(body.name).toBe("Консультация");
    expect(body.default_duration_minutes).toBe(60);
  });

  it("POST /api/activities без description сохраняет null", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/activities",
      payload: { name: "A", default_duration_minutes: 30 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().description).toBeNull();
  });

  it("POST /api/activities с невалидным default_duration_minutes → 422", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/activities",
      payload: { name: "A", default_duration_minutes: 2 },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("validation_failed");
  });
});

describe("schedules", () => {
  let activityId: number;

  beforeEach(async () => {
    const a = insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 60,
    });
    activityId = a.id;
  });

  it("GET /api/schedules возвращает []", async () => {
    const res = await app.inject({ method: "GET", url: "/api/schedules" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("POST /api/schedules создаёт и возвращает 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/schedules",
      payload: {
        activity_id: activityId,
        weekdays: ["mon", "wed"],
        start_time: "10:00:00",
        end_time: "12:00:00",
        duration_minutes: 60,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().weekdays).toEqual(["mon", "wed"]);
  });

  it("POST /api/schedules на несуществующую активность → 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/schedules",
      payload: {
        activity_id: 999,
        weekdays: ["mon"],
        start_time: "10:00:00",
        end_time: "12:00:00",
        duration_minutes: 60,
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("activity_not_found");
  });

  it("POST /api/schedules со start_time >= end_time → 422 invalid_time_window", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/schedules",
      payload: {
        activity_id: activityId,
        weekdays: ["mon"],
        start_time: "12:00:00",
        end_time: "10:00:00",
        duration_minutes: 60,
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("invalid_time_window");
  });
});

describe("slots", () => {
  it("GET /api/slots возвращает 6 слотов за 3 будних дня", async () => {
    const a = insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 60,
    });
    // Здесь seed использовал бы только среду, что дало бы 2 слота. Для
    // 6 слотов нужно 3 будних дня, поэтому вставим расписание напрямую.
    insertSchedule(db, {
      activity_id: a.id,
      weekdays: ["mon", "tue", "wed"],
      start_time: "10:00:00",
      end_time: "12:00:00",
      duration_minutes: 60,
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/slots?activity_id=1&date_from=2026-10-05&date_to=2026-10-11",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(6);
  });

  it("GET /api/slots с date_from > date_to → 422 validation_failed", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/slots?activity_id=1&date_from=2026-10-11&date_to=2026-10-05",
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("validation_failed");
  });

  it("GET /api/slots с диапазоном > 60 дней → 422", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/slots?activity_id=1&date_from=2026-10-05&date_to=2027-01-01",
    });
    expect(res.statusCode).toBe(422);
  });

  it("GET /api/slots на несуществующую активность → 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/slots?activity_id=999&date_from=2026-10-05&date_to=2026-10-11",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("activity_not_found");
  });

  it("после брони слот приходит с is_free=false; после отмены снова true", async () => {
    const a = insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 60,
    });
    await seed(a.id);

    // До брони: оба слота среды свободны.
    const before = await app.inject({
      method: "GET",
      url: `/api/slots?activity_id=${a.id}&date_from=2026-10-07&date_to=2026-10-07`,
    });
    expect(before.statusCode).toBe(200);
    const beforeSlots = before.json() as Array<{
      start_time: string;
      is_free: boolean;
    }>;
    expect(beforeSlots).toHaveLength(2);
    expect(beforeSlots.every((s) => s.is_free)).toBe(true);

    // Бронируем 10:00.
    const created = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        activity_id: a.id,
        date: "2026-10-07",
        start_time: "10:00:00",
        guest_name: "Иван",
        guest_email: "ivan@example.com",
      },
    });
    expect(created.statusCode).toBe(201);
    const bookingId = created.json().id as number;

    // После брони: 10:00 занят, 11:00 свободен.
    const afterBook = await app.inject({
      method: "GET",
      url: `/api/slots?activity_id=${a.id}&date_from=2026-10-07&date_to=2026-10-07`,
    });
    const afterBookSlots = afterBook.json() as Array<{
      start_time: string;
      is_free: boolean;
    }>;
    expect(afterBookSlots).toHaveLength(2);
    const ten = afterBookSlots.find((s) => s.start_time === "10:00:00");
    const eleven = afterBookSlots.find((s) => s.start_time === "11:00:00");
    expect(ten?.is_free).toBe(false);
    expect(eleven?.is_free).toBe(true);

    // Отменяем бронь.
    const cancelled = await app.inject({
      method: "POST",
      url: `/api/bookings/${bookingId}/cancel`,
    });
    expect(cancelled.statusCode).toBe(200);

    // После отмены слот снова свободен.
    const afterCancel = await app.inject({
      method: "GET",
      url: `/api/slots?activity_id=${a.id}&date_from=2026-10-07&date_to=2026-10-07`,
    });
    const afterCancelSlots = afterCancel.json() as Array<{
      start_time: string;
      is_free: boolean;
    }>;
    expect(afterCancelSlots.every((s) => s.is_free)).toBe(true);
  });
});

describe("bookings — полный сценарий", () => {
  it("создание → 201; дубликат → 409; cancel → 200; повторный cancel → 409", async () => {
    const a = insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 60,
    });
    await seed(a.id);

    const created = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        activity_id: a.id,
        date: "2026-10-07",
        start_time: "10:00:00",
        guest_name: "Иван",
        guest_email: "ivan@example.com",
      },
    });
    expect(created.statusCode).toBe(201);
    const bookingId = created.json().id;

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        activity_id: a.id,
        date: "2026-10-07",
        start_time: "10:00:00",
        guest_name: "Пётр",
        guest_email: "petr@example.com",
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe("slot_taken");

    const second = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        activity_id: a.id,
        date: "2026-10-07",
        start_time: "11:00:00",
        guest_name: "Пётр",
        guest_email: "petr@example.com",
      },
    });
    expect(second.statusCode).toBe(201);

    const bad = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        activity_id: a.id,
        date: "2026-10-07",
        start_time: "15:00:00",
        guest_name: "X",
        guest_email: "x@example.com",
      },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().code).toBe("slot_not_found");

    const cancelled = await app.inject({
      method: "POST",
      url: `/api/bookings/${bookingId}/cancel`,
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().status).toBe("cancelled");

    const cancelAgain = await app.inject({
      method: "POST",
      url: `/api/bookings/${bookingId}/cancel`,
    });
    expect(cancelAgain.statusCode).toBe(409);
    expect(cancelAgain.json().code).toBe("booking_already_cancelled");

    const afterCancel = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        activity_id: a.id,
        date: "2026-10-07",
        start_time: "10:00:00",
        guest_name: "Семён",
        guest_email: "s@example.com",
      },
    });
    expect(afterCancel.statusCode).toBe(201);
  });

  it("GET /api/bookings?guest_email=... фильтрует", async () => {
    const a = insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 60,
    });
    await seed(a.id);
    await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        activity_id: a.id,
        date: "2026-10-07",
        start_time: "10:00:00",
        guest_name: "Иван",
        guest_email: "ivan@example.com",
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        activity_id: a.id,
        date: "2026-10-07",
        start_time: "11:00:00",
        guest_name: "Пётр",
        guest_email: "petr@example.com",
      },
    });
    const all = await app.inject({ method: "GET", url: "/api/bookings" });
    const onlyIvan = await app.inject({
      method: "GET",
      url: "/api/bookings?guest_email=ivan@example.com",
    });
    expect(all.json()).toHaveLength(2);
    expect(onlyIvan.json()).toHaveLength(1);
  });

  it("невалидное тело → 422 validation_failed", async () => {
    const a = insertActivity(db, {
      name: "A",
      description: null,
      default_duration_minutes: 60,
    });
    await seed(a.id);
    const res = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        activity_id: a.id,
        date: "bad-date",
        start_time: "10:00:00",
        guest_name: "X",
        guest_email: "not-an-email",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("validation_failed");
  });
});
