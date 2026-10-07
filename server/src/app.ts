// Сборка приложения Fastify. AGENTS.md, раздел 5:
// "server/src/app.ts — сборка приложения Fastify".
// AGENTS.md, раздел 9: "Ошибку `ZodError` превращает в ответ 422 общий
// обработчик в `app.ts`."

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { type Db } from "./db.js";
import { ApiError, type ErrorResponseBody } from "./errors.js";
import { activitiesRoutes } from "./routes/activities.js";
import { adminRoutes, setupAdmin } from "./routes/admin.js";
import { bookingsRoutes } from "./routes/bookings.js";
import { schedulesRoutes } from "./routes/schedules.js";
import { slotsRoutes } from "./routes/slots.js";
import { buildMailer, type Mailer } from "./mailer.js";
import type { Config } from "./config.js";

// Расширяемый тип Fastify — декоратор `db`, который устанавливается
// здесь через `app.decorate("db", db)`. Тип `getActivityOrFail` объявлен
// отдельно в `routes/activities.ts` — там же, где он реализован.
declare module "fastify" {
  interface FastifyInstance {
    readonly db: Db;
    readonly mailer: Mailer;
  }
}

export interface AppOptions extends FastifyServerOptions {
  readonly config: Config;
  readonly db: Db;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { config, db } = options;
  const app = Fastify({
    // Поднимаем тело запроса как JSON без `JSON Schema` (AGENTS.md §9:
    // "Схемы Fastify на JSON Schema сознательно не используются").
    ...options,
  });

  // `db` нужен плагинам маршрутов. Декорируем инстанс до регистрации
  // плагинов, чтобы `fastify.db` был доступен внутри них. Это
  // альтернатива передаче через `register` (в Fastify 5 декораторы через
  // `register` не «протекают» наружу без `await`, поэтому декорируем
  // напрямую).
  app.decorate("db", db);

  // Учётные данные администратора и секрет сессии — в замыкании
  // фабрики `setupAdmin` (см. `routes/admin.ts`).
  setupAdmin(app, config, db);

  // Mailer. Если SMTP_* в env не заданы — no-op (см. ADR 0005).
  // Ничего не ломается, бронь и отмена работают без писем.
  app.decorate("mailer", buildMailer(config.smtp));
  if (!app.mailer.isEnabled()) {
    app.log.warn(
      "SMTP не сконфигурирован: письма гостям отправляться не будут. " +
        "Задайте SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM.",
    );
  }

  // Предупреждения в лог. Решение в ADR 0004: в проде логин/пароль
  // и секрет сессии должны быть заданы явно. Если используются
  // dev-значения, печатаем `warn`, чтобы это было видно в логах.
  if (config.adminLogin === "admin" && config.adminPassword === "Pas!_123") {
    app.log.warn(
      "Администратор работает с логином и паролем по умолчанию. " +
        "Задайте BOOKING_ADMIN_LOGIN и BOOKING_ADMIN_PASSWORD для прода.",
    );
  }

  // CORS нужен для dev-режима: веб на 5173 ходит на сервис на 8000.
  // В собранном виде web/dist отдаётся тем же сервером — CORS не
  // нужен, но и не мешает. `credentials: true` разрешает передачу
  // cookie `admin_session` из браузера.
  await app.register(fastifyCors, {
    origin: config.webOrigin,
    methods: ["GET", "POST"],
    credentials: true,
  });

  // Подключаем все маршруты. Админские — после обычных: `notFound`
  // отдаёт `route_not_found` для любого `/api/admin/...` если
  // маршрут не зарегистрирован.
  await app.register(activitiesRoutes);
  await app.register(schedulesRoutes);
  await app.register(slotsRoutes);
  await app.register(bookingsRoutes);
  await app.register(adminRoutes);

  // Собранный интерфейс отдаётся тем же сервисом, поэтому в промышленном
  // запуске нет ни второго порта, ни настроек междоменных запросов.
  // Проверяем, что папка существует: в тестах `BOOKING_WEB_DIR` может
  // указывать на пустую директорию, и регистрировать плагин тогда
  // не нужно — иначе `@fastify/static` упадёт на старте. Путь
  // приводим к абсолютному: `@fastify/static` отказывается работать
  // с относительными путями, а в тестах `webDir` иногда приходит как ".".
  const webRoot = resolve(config.webDir);
  const hasWeb = existsSync(webRoot);
  if (hasWeb) {
    await app.register(fastifyStatic, { root: webRoot, prefix: "/" });
  }

  // Не найденный путь — либо запрос к API (тогда 404 c `route_not_found`),
  // либо адрес интерфейса (тогда отдаём `index.html` для SPA-роутинга).
  // Без этой развилки любой `GET /foo` упирался бы в 404 и SPA не
  // открывалась бы по произвольному пути.
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      const body: ErrorResponseBody = {
        code: "route_not_found",
        message: "Такого эндпоинта нет",
      };
      return reply.code(404).send(body);
    }
    if (hasWeb) {
      return reply.sendFile("index.html");
    }
    return reply
      .code(404)
      .send({ code: "route_not_found", message: "Страница не найдена" });
  });

  // Общий обработчик ошибок. AGENTS.md §9: ошибки превращаются в
  // ответ `{ code, message }` на русском. ZodError отдельно не ловим:
  // обработчики используют `parseOrThrow` (см. `errors.ts`), который
  // превращает его в `ApiError("validation_failed")`. Это убирает
  // зависимость от внутренней логики Fastify 5, которая иногда
  // оборачивает ZodError в свой `FastifyError` до того, как сработает
  // `setErrorHandler`.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      const body: ErrorResponseBody = {
        code: error.code,
        message: error.message,
      };
      reply.code(error.statusCode).send(body);
      return;
    }
    // Неизвестная ошибка — логируем и отдаём 500 без деталей.
    app.log.error(error);
    reply.code(500).send({
      code: "internal_error",
      message: "Внутренняя ошибка сервера",
    });
  });

  return app;
}
