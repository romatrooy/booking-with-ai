// Интеграционные тесты админ-эндпоинтов. Используем `app.inject`,
// как `api.test.ts` — без сетевого сокета.
//
// БД — `:memory:`. На Windows `unlink` файла сразу после закрытия
// приложения иногда даёт `EBUSY` из-за задержки освобождения
// дескриптора, поэтому используем in-memory SQLite и очищаем
// таблицы между тестами явно.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { openDb } from "../../src/db.js";
import { clearAllLoginAttempts } from "../../src/adminAuth.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let db: ReturnType<typeof openDb>;

function reset(): void {
  db.exec("DELETE FROM bookings;");
  db.exec("DELETE FROM schedules;");
  db.exec("DELETE FROM activities;");
}

function seed(): void {
  db.exec(`
    INSERT INTO activities (name, description, default_duration_minutes)
    VALUES ('Консультация', 'desc', 60);
  `);
  db.exec(`
    INSERT INTO activities (name, description, default_duration_minutes)
    VALUES ('Код-ревью', 'desc', 30);
  `);
  db.exec(`
    INSERT INTO schedules (activity_id, weekdays, start_time, end_time, duration_minutes)
    VALUES (1, '["mon","tue","wed","thu","fri"]', '10:00:00', '12:00:00', 60);
  `);
  db.exec(`
    INSERT INTO bookings (activity_id, date, start_time, guest_name, guest_email)
    VALUES (1, '2026-01-15', '10:00:00', 'Иван', 'ivan@example.com');
  `);
  db.exec(`
    INSERT INTO bookings (activity_id, date, start_time, guest_name, guest_email)
    VALUES (2, '2026-01-15', '18:00:00', 'Мария', 'maria@example.com');
  `);
}

beforeEach(async () => {
  clearAllLoginAttempts();
  db = openDb(":memory:");
  seed();
  app = await buildApp({
    config: {
      port: 0,
      host: "127.0.0.1",
      dbFile: ":memory:",
      webDir: ".",
      webOrigin: "http://localhost:5173",
      adminLogin: "admin",
      adminPassword: "Pas!_123",
      sessionSecret: "test-secret-32-bytes-long-1234",
    },
    db,
  });
  await app.ready();
});

afterEach(async () => {
  if (app !== undefined) {
    await app.close();
  }
  // Подчищаем счётчик попыток — `db` закрывается автоматически
  // при выходе из процесса теста, явно закрывать не нужно.
  reset();
});

describe("POST /api/admin/login", () => {
  it("успешный вход возвращает login и attempts_left, ставит cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { login: "admin", password: "Pas!_123" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      login: string;
      attempts_left: number;
    };
    expect(body.ok).toBe(true);
    expect(body.login).toBe("admin");
    expect(body.attempts_left).toBe(5);
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookie = String(setCookie);
    expect(cookie).toMatch(/admin_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it("неверный пароль → 401 с attempts_left", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { login: "admin", password: "wrong" },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { code: string; attempts_left: number };
    expect(body.code).toBe("unauthorized");
    expect(body.attempts_left).toBe(4);
  });

  it("неверный логин → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { login: "hacker", password: "Pas!_123" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("после 5 неудачных — 6-я с attempts_left: 0", async () => {
    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: "POST",
        url: "/api/admin/login",
        payload: { login: "admin", password: "wrong" },
      });
    }
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { login: "admin", password: "Pas!_123" },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { attempts_left: number };
    expect(body.attempts_left).toBe(0);
  });

  it("пустое тело → 422", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: {},
    });
    expect(res.statusCode).toBe(422);
    expect((res.json() as { code: string }).code).toBe("validation_failed");
  });
});

describe("POST /api/admin/logout", () => {
  it("очищает cookie", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { login: "admin", password: "Pas!_123" },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const logout = await app.inject({
      method: "POST",
      url: "/api/admin/logout",
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(200);
    const setCookie = String(logout.headers["set-cookie"]);
    expect(setCookie).toMatch(/Max-Age=0/);
  });
});

describe("GET /api/admin/me", () => {
  it("без cookie → logged_in: false", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/me" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ logged_in: false });
  });

  it("с валидной cookie → logged_in: true, login", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { login: "admin", password: "Pas!_123" },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ logged_in: true, login: "admin" });
  });
});

describe("GET /api/admin/bookings", () => {
  it("без cookie → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/bookings" });
    expect(res.statusCode).toBe(401);
  });

  it("с cookie возвращает все брони с activity_name", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { login: "admin", password: "Pas!_123" },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/bookings",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{ activity_name: string }>;
    expect(rows.length).toBe(2);
    expect(rows[0]?.activity_name).toBe("Консультация");
    expect(rows[1]?.activity_name).toBe("Код-ревью");
  });

  it("фильтр по activity_id", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { login: "admin", password: "Pas!_123" },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/bookings?activity_id=1",
      headers: { cookie },
    });
    const rows = res.json() as Array<{ activity_id: number }>;
    expect(rows.every((r) => r.activity_id === 1)).toBe(true);
  });
});

describe("GET /api/admin/activities", () => {
  it("возвращает активности с cookie", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { login: "admin", password: "Pas!_123" },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/activities",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const acts = res.json() as Array<{ name: string }>;
    expect(acts.length).toBe(2);
  });

  it("без cookie → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/activities",
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/admin/bookings/:id/cancel", () => {
  it("отменяет бронь под админом", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { login: "admin", password: "Pas!_123" },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const list = await app.inject({
      method: "GET",
      url: "/api/admin/bookings",
      headers: { cookie },
    });
    const id = (list.json() as Array<{ id: number }>)[0]?.id;
    expect(id).toBeDefined();
    const cancel = await app.inject({
      method: "POST",
      url: `/api/admin/bookings/${id}/cancel`,
      headers: { cookie },
    });
    expect(cancel.statusCode).toBe(200);
    expect((cancel.json() as { status: string }).status).toBe("cancelled");
  });

  it("без cookie → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/bookings/1/cancel",
    });
    expect(res.statusCode).toBe(401);
  });
});
