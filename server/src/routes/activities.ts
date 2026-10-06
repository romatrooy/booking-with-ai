// Маршруты для активностей. AGENTS.md, раздел 5:
// "server/src/routes/ — обработчики маршрутов, по файлу на сущность".
// AGENTS.md, раздел 9: "В обработчиках маршрутов SQL нет".

import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { getActivity, insertActivity, listActivities } from "../repository.js";
import { activityCreateSchema, type Activity } from "../schemas.js";
import { ApiError, parseOrThrow } from "../errors.js";

// Обёртка `fp` снимает инкапсуляцию плагина: без неё `getActivityOrFail`,
// зарегистрированный здесь через `fastify.decorate`, виден только
// внутри этого плагина и его потомков, но не в других плагинах.
// `fastify-plugin` (он же `fp`) «продвигает» декоратор на уровень
// родителя, и тогда он доступен всем обработчикам.
export const activitiesRoutes = fp(
  async (fastify: Parameters<FastifyPluginAsync>[0]) => {
    const { db } = fastify;

    fastify.get("/api/activities", async () => {
      return listActivities(db);
    });

    fastify.post("/api/activities", async (request, reply) => {
      const body = parseOrThrow(request.body, activityCreateSchema);
      const description = body.description ?? null;
      const created = insertActivity(db, {
        name: body.name,
        description,
        default_duration_minutes: body.default_duration_minutes,
      });
      reply.code(201);
      return created;
    });

    // Используется в `routes/schedules.ts` и `routes/slots.ts` — общий
    // помощник "есть ли такая активность". Вынесен сюда, чтобы не
    // дублировать. Бросает ApiError("activity_not_found").
    fastify.decorate("getActivityOrFail", (id: number): Activity => {
      const a = getActivity(db, id);
      if (!a) throw new ApiError("activity_not_found");
      return a;
    });
  },
);

// Расширяемый тип Fastify, чтобы обработчики других маршрутов видели
// `getActivityOrFail` через `fastify.getActivityOrFail`.
declare module "fastify" {
  interface FastifyInstance {
    getActivityOrFail(id: number): Activity;
  }
}
