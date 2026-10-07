// Маршруты админки. См. AGENTS.md §5.
//
// Все эндпоинты (кроме `/login` и `/me`) требуют валидной cookie
// `admin_session`. Проверка делается в `requireAdmin()` ниже —
// он бросает `ApiError("unauthorized")`, если cookie нет или
// подпись неверна, и обработчик в `app.ts` превращает это в 401.

import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  LOGIN_LIMIT,
  SESSION_COOKIE,
  buildAdminCredentials,
  consumeLoginAttempt,
  registerLoginFailure,
  resetLoginAttempts,
  signSession,
  verifySession,
  type AdminCredentials,
} from "../adminAuth.js";
import {
  cancelBooking,
  getBooking,
  listActivities,
  listBookingsForAdmin,
  listSchedules,
} from "../repository.js";
import {
  adminBookingsQuerySchema,
  adminLoginSchema,
  bookingIdParamSchema,
} from "../schemas.js";
import { ApiError, parseOrThrow, type AdminErrorBody } from "../errors.js";
import type { Db } from "../db.js";
import type { Config } from "../config.js";

// Ключ декоратора Fastify, через который обработчики получают
// `adminCredentials` и `sessionSecret`, установленные в `app.ts`.
declare module "fastify" {
  interface FastifyInstance {
    adminCredentials: AdminCredentials;
    sessionSecret: string;
  }
}

// Простой разбор заголовка `Cookie`. Нам нужен один параметр
// `admin_session`, поэтому не подключаем `@fastify/cookie` — это
// лишняя зависимость. Формат: `name=value; name2=value2`.
function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (typeof header !== "string" || header.length === 0) return undefined;
  const parts = header.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    if (key !== name) continue;
    return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return undefined;
}

function clientIp(request: FastifyRequest): string {
  // `request.ip` учитывает `trustProxy` в Fastify 5; для
  // dev-режима `0.0.0.0` он скорее всего вернёт `127.0.0.1`.
  return request.ip;
}

// Проверяет сессию и возвращает логин администратора. При
// неуспехе бросает `ApiError("unauthorized")` — общий обработчик
// в `app.ts` превратит его в 401 без поля `attempts_left`
// (оно имеет смысл только на `/login`).
function requireAdmin(request: FastifyRequest, secret: string): string {
  const value = readCookie(request.headers.cookie, SESSION_COOKIE);
  const session = verifySession(secret, value);
  if (session === null) {
    throw new ApiError("unauthorized");
  }
  return session.login;
}

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── POST /api/admin/login ─────────────────────────────────────────────
  fastify.post("/api/admin/login", async (request, reply) => {
    const body = parseOrThrow(request.body, adminLoginSchema);
    const ip = clientIp(request);

    // Резервируем попытку до проверки пароля: даже если придёт 6-я
    // попытка, лимит сработает здесь, до сравнения хешей.
    try {
      consumeLoginAttempt(ip);
    } catch (error) {
      // Лимит превышен — отдаём 401 c `attempts_left: 0`.
      if (error instanceof ApiError) {
        const errBody: AdminErrorBody = {
          code: "unauthorized",
          message: error.message,
          attempts_left: 0,
        };
        reply.code(error.statusCode).send(errBody);
        return errBody;
      }
      throw error;
    }

    const creds = fastify.adminCredentials;
    if (body.login !== creds.login || !creds.verify(body.password)) {
      // Регистрируем неудачу: следующий неверный ввод уменьшит
      // `attempts_left` ещё на единицу.
      const left = registerLoginFailure(ip);
      const errBody: AdminErrorBody = {
        code: "unauthorized",
        message: "Неверный логин или пароль",
        attempts_left: left,
      };
      reply.code(401).send(errBody);
      return errBody;
    }

    // Успех: сбрасываем счётчик и подписываем cookie.
    resetLoginAttempts(ip);
    const value = signSession(fastify.sessionSecret, creds.login);
    reply.header(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${8 * 60 * 60}`,
    );
    return {
      ok: true,
      login: creds.login,
      attempts_left: LOGIN_LIMIT,
    };
  });

  // ─── POST /api/admin/logout ────────────────────────────────────────────
  fastify.post("/api/admin/logout", async (_request, reply) => {
    reply.header(
      "Set-Cookie",
      `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    );
    return { ok: true };
  });

  // ─── GET /api/admin/me ─────────────────────────────────────────────────
  fastify.get("/api/admin/me", async (request) => {
    const value = readCookie(request.headers.cookie, SESSION_COOKIE);
    const session = verifySession(fastify.sessionSecret, value);
    if (session === null) {
      return { logged_in: false };
    }
    return { logged_in: true, login: session.login };
  });

  // Все эндпоинты ниже требуют валидной сессии.
  fastify.get("/api/admin/bookings", async (request) => {
    requireAdmin(request, fastify.sessionSecret);
    const query = parseOrThrow(request.query, adminBookingsQuerySchema);
    // `exactOptionalPropertyTypes` запрещает передавать `undefined`
    // в опциональные поля — собираем объект только из заданных.
    const filters: {
      activityId?: number;
      dateFrom?: string;
      dateTo?: string;
    } = {};
    if (query.activity_id !== undefined) filters.activityId = query.activity_id;
    if (query.date_from !== undefined) filters.dateFrom = query.date_from;
    if (query.date_to !== undefined) filters.dateTo = query.date_to;
    return listBookingsForAdmin(fastify.db, filters);
  });

  fastify.get("/api/admin/activities", async (request) => {
    requireAdmin(request, fastify.sessionSecret);
    return listActivities(fastify.db);
  });

  fastify.get("/api/admin/schedules", async (request) => {
    requireAdmin(request, fastify.sessionSecret);
    const raw = (request.query as Record<string, unknown>)["activity_id"];
    if (typeof raw === "string" && raw.length > 0) {
      const id = Number.parseInt(raw, 10);
      if (Number.isNaN(id) || id <= 0) {
        throw new ApiError("validation_failed");
      }
      return listSchedules(fastify.db, id);
    }
    return listSchedules(fastify.db);
  });

  fastify.post("/api/admin/bookings/:booking_id/cancel", async (request) => {
    requireAdmin(request, fastify.sessionSecret);
    const { booking_id } = parseOrThrow(request.params, bookingIdParamSchema);
    const cancelled = cancelBooking(fastify.db, booking_id);
    if (cancelled === null) {
      const existing = getBooking(fastify.db, booking_id);
      if (existing === null) {
        throw new ApiError("booking_not_found");
      }
      throw new ApiError("booking_already_cancelled");
    }
    return cancelled;
  });
};

// Фабрика, которая собирает объект `adminCredentials` и кладёт
// `sessionSecret` в Fastify-инстанс. Вызывается из `app.ts`.
export function setupAdmin(
  app: import("fastify").FastifyInstance,
  config: Config,
  db: Db,
): void {
  const creds = buildAdminCredentials(config.adminLogin, config.adminPassword);
  app.decorate("adminCredentials", creds);
  app.decorate("sessionSecret", config.sessionSecret);
  // `db` передаётся для симметрии с другими `setup*` (не
  // используется здесь — `app.decorate("db", db)` уже стоит).
  void db;
}
