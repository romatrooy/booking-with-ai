// Маршрут для слотов. См. AGENTS.md, раздел 5.
//
// Слоты — вычисляемое представление, в БД их нет (ADR 0002). Здесь
// собираем расписания активности, занятые слоты и передаём в чистую
// функцию `buildSlots`.

import type { FastifyPluginAsync } from "fastify";
import { listBusySlots, listSchedules } from "../repository.ts";
import { buildSlots } from "../slotEngine.ts";
import { slotsQuerySchema } from "../schemas.ts";
import { parseOrThrow } from "../errors.ts";

export const slotsRoutes: FastifyPluginAsync = async (fastify) => {
  const { db } = fastify;

  fastify.get("/api/slots", async (request) => {
    // `slotsQuerySchema` уже содержит `.refine` для проверки диапазона
    // дат и максимальной длины (60 дней). ZodError прилетит как
    // 422 validation_failed из общего обработчика.
    const query = parseOrThrow(request.query, slotsQuerySchema);
    // Проверяем, что активность существует, иначе вернём пустой
    // массив — 404 на запрос слотов был бы странным.
    fastify.getActivityOrFail(query.activity_id);
    // Берём все расписания этой активности и объединяем слоты. Не
    // нужно отдельно проверять, есть ли хоть одно расписание: если
    // его нет, `buildSlots` просто вернёт пустой массив.
    const schedules = listSchedules(db, query.activity_id);
    const busy = listBusySlots(
      db,
      query.activity_id,
      query.date_from,
      query.date_to,
    );
    const result = [];
    for (const schedule of schedules) {
      result.push(
        ...buildSlots(schedule, busy, query.date_from, query.date_to),
      );
    }
    return result;
  });
};
