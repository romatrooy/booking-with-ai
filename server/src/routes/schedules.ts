// Маршруты для расписаний. См. AGENTS.md, раздел 5.

import type { FastifyPluginAsync } from "fastify";
import { insertSchedule, listSchedules } from "../repository.ts";
import { scheduleCreateSchema } from "../schemas.ts";
import { ApiError, parseOrThrow } from "../errors.ts";

export const schedulesRoutes: FastifyPluginAsync = async (fastify) => {
  const { db } = fastify;

  fastify.get("/api/schedules", async (request) => {
    // Query-параметр `activity_id` опционален (см. README, "Эндпоинты").
    // Fastify 5 без `zod-type-provider` оставляет `request.query` как
    // `unknown`, поэтому приводим явно — `Zod`-схема `slotsQuerySchema`
    // и `bookingsQuerySchema` отвечают за полную валидацию.
    const query = request.query as Record<string, unknown>;
    const raw = query["activity_id"];
    if (typeof raw === "string" && raw.length > 0) {
      const id = Number.parseInt(raw, 10);
      if (Number.isNaN(id) || id <= 0) {
        throw new ApiError("validation_failed");
      }
      // Если активности нет — пустой список. Это согласуется с тем,
      // как ведёт себя GET /api/activities: он возвращает все, без
      // 404. Для расписания фильтр без совпадений — тоже пустой
      // массив.
      fastify.getActivityOrFail(id);
      return listSchedules(db, id);
    }
    return listSchedules(db);
  });

  fastify.post("/api/schedules", async (request, reply) => {
    const body = parseOrThrow(request.body, scheduleCreateSchema);
    // Проверяем, что активность существует. Без этого INSERT упадёт
    // по внешнему ключу с невнятной ошибкой.
    fastify.getActivityOrFail(body.activity_id);
    // Проверяем, что окно не пустое. `Schedule.duration_minutes`
    // уже проверил Zod (>0), но `start_time >= end_time` он не
    // поймал — это семантическая проверка.
    if (body.start_time >= body.end_time) {
      throw new ApiError("invalid_time_window");
    }
    const created = insertSchedule(db, {
      activity_id: body.activity_id,
      weekdays: body.weekdays,
      start_time: body.start_time,
      end_time: body.end_time,
      duration_minutes: body.duration_minutes,
    });
    reply.code(201);
    return created;
  });
};
