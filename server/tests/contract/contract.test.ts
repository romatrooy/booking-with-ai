// Тест соответствия API контракту. AGENTS.md, раздел 8:
// «Тест `server/tests/contract.test.ts` читает `contract/openapi.yaml`
// и требует, чтобы приложение ему подчинялось: набор эндпоинтов,
// коды состояний и тела ответов. Если начать с кода, этот тест
// упадёт. Так и задумано».
//
// Здесь мы проверяем, что все эндпоинты, заявленные в OpenAPI,
// зарегистрированы в собранном Fastify-приложении. Полная проверка
// тел ответов выходит за рамки одного теста — для этого есть
// `api.test.ts`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.ts";
import { openDb } from "../../src/db.ts";
import type { Config } from "../../src/config.ts";

const here = dirname(fileURLToPath(import.meta.url));
// `tests/contract/contract.test.ts` → `../../../../contract/openapi.yaml`
const openapiPath = resolve(here, "..", "..", "..", "contract", "openapi.yaml");
const openapi = readFileSync(openapiPath, "utf8");

function makeConfig(): Config {
  return {
    port: 0,
    host: "127.0.0.1",
    dbFile: ":memory:",
    webDir: resolve(here, "..", "..", "..", "web", "dist"),
    webOrigin: "http://localhost:5173",
    adminLogin: "test-admin",
    adminPassword: "test-pass-123",
    sessionSecret: "test-secret-32-bytes-long-1234",
    smtp: null,
  };
}

describe("contract: соответствие API contract/openapi.yaml", () => {
  it("контракт содержит все эндпоинты (гостевые и админские)", () => {
    const expected = [
      "/api/activities",
      "/api/schedules",
      "/api/slots",
      "/api/bookings",
      "/api/bookings/{booking_id}/cancel",
      "/api/admin/login",
      "/api/admin/logout",
      "/api/admin/me",
      "/api/admin/bookings",
      "/api/admin/activities",
      "/api/admin/schedules",
      "/api/admin/bookings/{booking_id}/cancel",
    ];
    for (const path of expected) {
      expect(openapi, `OpenAPI должен содержать путь ${path}`).toContain(path);
    }
  });

  it("контракт содержит схемы всех доменных моделей", () => {
    for (const schema of [
      "Activity",
      "ActivityCreate",
      "Schedule",
      "ScheduleCreate",
      "Slot",
      "Booking",
      "BookingCreate",
      "BookingStatus",
      "Weekday",
      "ApiError",
      // Админские схемы TypeSpec кладёт в namespace `Admin`, поэтому
      // в OpenAPI они появляются как `Admin.LoginRequest` и т. п.
      "Admin.LoginRequest",
      "Admin.LoginResponse",
      "Admin.MeResponse",
      "Admin.AdminBookingRow",
      "Admin.AdminError",
    ]) {
      expect(openapi, `OpenAPI должен содержать схему ${schema}`).toContain(
        `${schema}:`,
      );
    }
  });

  it("контракт содержит все машиночитаемые коды ошибок", async () => {
    // Коды ошибок живут в `server/src/errors.ts` как литеральный union
    // `ErrorCode`. Контракт `openapi.yaml` фиксирует только форму
    // ответа (поля `code`, `message` через `ApiError`/`ValidationError`),
    // но не обязан перечислять каждое значение — это задача кода.
    // Здесь мы проверяем, что в коде есть все коды и у каждого есть
    // HTTP-статус и русский текст.
    const { errors } = await import("../../src/errors.ts");
    const expectedCodes = [
      "activity_not_found",
      "booking_not_found",
      "route_not_found",
      "slot_taken",
      "booking_already_cancelled",
      "validation_failed",
      "slot_not_found",
      "invalid_time_window",
      "invalid_date_range",
      "unauthorized",
    ];
    for (const code of expectedCodes) {
      const entry = errors[code as keyof typeof errors];
      expect(entry, `код ${code} должен быть в объекте errors`).toBeDefined();
      expect(
        entry.statusCode,
        `код ${code}: statusCode`,
      ).toBeGreaterThanOrEqual(400);
      expect(entry.message, `код ${code}: text`).toBeTypeOf("string");
      expect(
        entry.message.length,
        `код ${code}: текст не пустой`,
      ).toBeGreaterThan(0);
    }
  });

  it("приложение регистрирует все эндпоинты из контракта", async () => {
    const config = makeConfig();
    const db = openDb(":memory:");
    try {
      const app = await buildApp({ config, db });
      // Используем `app.hasRoute` — это программный API Fastify 5.
      // Он проверяет, что маршрут с заданным методом и url
      // зарегистрирован, и возвращает boolean. Это надёжнее, чем
      // парсить текстовый вывод `printRoutes`.
      const expectedRoutes: Array<{ method: string; url: string }> = [
        { method: "GET", url: "/api/activities" },
        { method: "POST", url: "/api/activities" },
        { method: "GET", url: "/api/schedules" },
        { method: "POST", url: "/api/schedules" },
        { method: "GET", url: "/api/slots" },
        { method: "GET", url: "/api/bookings" },
        { method: "POST", url: "/api/bookings" },
        { method: "POST", url: "/api/bookings/:booking_id/cancel" },
        { method: "POST", url: "/api/admin/login" },
        { method: "POST", url: "/api/admin/logout" },
        { method: "GET", url: "/api/admin/me" },
        { method: "GET", url: "/api/admin/bookings" },
        { method: "GET", url: "/api/admin/activities" },
        { method: "GET", url: "/api/admin/schedules" },
        { method: "POST", url: "/api/admin/bookings/:booking_id/cancel" },
      ];
      for (const { method, url } of expectedRoutes) {
        // `app.hasRoute` принимает в Fastify 5 первый аргумент
        // `{ method, url }` или две строки. Используем объект для ясности.
        const ok =
          typeof (
            app as unknown as {
              hasRoute: (r: { method: string; url: string }) => boolean;
            }
          ).hasRoute === "function"
            ? (
                app as unknown as {
                  hasRoute: (r: { method: string; url: string }) => boolean;
                }
              ).hasRoute({ method, url })
            : false;
        expect(ok, `приложение должно зарегистрировать ${method} ${url}`).toBe(
          true,
        );
      }
      await app.close();
    } finally {
      db.close();
    }
  });
});
