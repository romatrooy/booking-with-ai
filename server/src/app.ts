// Сборка приложения Fastify. AGENTS.md, раздел 5:
// "server/src/app.ts — сборка приложения Fastify".
// AGENTS.md, раздел 9: "Ошибку `ZodError` превращает в ответ 422 общий
// обработчик в `app.ts`."

import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import fastifyCors from "@fastify/cors";
import { type Db } from "./db.ts";
import { ApiError, type ErrorResponseBody } from "./errors.ts";
import { activitiesRoutes } from "./routes/activities.ts";
import { bookingsRoutes } from "./routes/bookings.ts";
import { schedulesRoutes } from "./routes/schedules.ts";
import { slotsRoutes } from "./routes/slots.ts";
import type { Config } from "./config.ts";

// Расширяемый тип Fastify — декоратор `db`, который устанавливается
// здесь через `app.decorate("db", db)`. Тип `getActivityOrFail` объявлен
// отдельно в `routes/activities.ts` — там же, где он реализован.
declare module "fastify" {
  interface FastifyInstance {
    readonly db: Db;
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

  // CORS нужен для dev-режима: веб на 5173 ходит на сервис на 8000.
  // В собранном виде web/dist отдаётся тем же сервером — CORS не
  // нужен, но и не мешает.
  await app.register(fastifyCors, {
    origin: config.webOrigin,
    methods: ["GET", "POST"],
  });

  // Подключаем все маршруты.
  await app.register(activitiesRoutes);
  await app.register(schedulesRoutes);
  await app.register(slotsRoutes);
  await app.register(bookingsRoutes);

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
