// Маршруты для броней. См. AGENTS.md, раздел 5.
//
// Главное правило — инвариант И1: на один слот не более одной
// действующей брони. Защита в два рубежа, см. ADR 0003. Здесь мы
// обрабатываем `SqliteError`, который пробрасывает `insertBooking` при
// нарушении частичного уникального индекса `uq_active_booking`, и
// превращаем его в 409 slot_taken.

import type { FastifyPluginAsync } from "fastify";
import { SqliteError } from "better-sqlite3";
import type { Db } from "../db.js";
import {
  cancelBooking,
  getActivity,
  getBooking,
  insertBooking,
  listBookings,
  listSchedules,
  listBusySlots,
} from "../repository.js";
import { buildSlots } from "../slotEngine.js";
import {
  bookingCreateSchema,
  bookingIdParamSchema,
  bookingsQuerySchema,
} from "../schemas.js";
import { ApiError, parseOrThrow } from "../errors.js";

// Код нарушения уникальности в `better-sqlite3`. Документация:
// https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
const SQLITE_CONSTRAINT_UNIQUE = "SQLITE_CONSTRAINT_UNIQUE";

export const bookingsRoutes: FastifyPluginAsync = async (fastify) => {
  const { db } = fastify;

  fastify.get("/api/bookings", async (request) => {
    const query = parseOrThrow(request.query, bookingsQuerySchema);
    if (query.guest_email !== undefined) {
      return listBookings(db, query.guest_email);
    }
    return listBookings(db);
  });

  fastify.post("/api/bookings", async (request, reply) => {
    const body = parseOrThrow(request.body, bookingCreateSchema);
    // Проверяем активность. 404, если её нет. Сохраняем — нужно для
    // письма гостю (см. ниже).
    const activity = fastify.getActivityOrFail(body.activity_id);
    // Проверяем, что слот в принципе есть в расписании (без учёта
    // занятости). Это защита от подделанного запроса "гость прислал
    // произвольное время". (Инвариант И1 в онтологии, пункт 9.)
    if (!slotInSchedule(db, body.activity_id, body.date, body.start_time)) {
      throw new ApiError("slot_not_found");
    }
    // Проверяем, что слот не занят. Дубликат → 409 slot_taken (по
    // README, "Повторный такой же запрос вернёт код 409 и тело: { code:
    // slot_taken, ... }").
    const busy = listBusySlots(db, body.activity_id, body.date, body.date);
    if (busy.some((b) => b.start_time === body.start_time)) {
      throw new ApiError("slot_taken");
    }
    try {
      const created = insertBooking(db, {
        activity_id: body.activity_id,
        date: body.date,
        start_time: body.start_time,
        guest_name: body.guest_name,
        guest_email: body.guest_email,
      });
      // Письмо гостю — побочный эффект, см. ADR 0005. Ошибка
      // отправки логируется внутри `mailer` и не ломает 201.
      void fastify.mailer.sendBookingCreated(created, activity);
      reply.code(201);
      return created;
    } catch (error) {
      // Второй рубеж защиты (ADR 0003): если гонка пропустила
      // прикладную проверку, частичный уникальный индекс не даст
      // вставить вторую активную бронь. Здесь мы ловим конкретно
      // `SQLITE_CONSTRAINT_UNIQUE` на индексе `uq_active_booking`.
      if (
        error instanceof SqliteError &&
        error.code === SQLITE_CONSTRAINT_UNIQUE
      ) {
        throw new ApiError("slot_taken");
      }
      throw error;
    }
  });

  fastify.post("/api/bookings/:booking_id/cancel", async (request) => {
    const { booking_id } = parseOrThrow(request.params, bookingIdParamSchema);
    const cancelled = cancelBooking(db, booking_id);
    if (!cancelled) {
      // Не нашли: либо id не существует, либо уже отменён. Различаем
      // по `getBooking`.
      const existing = getBooking(db, booking_id);
      if (!existing) {
        throw new ApiError("booking_not_found");
      }
      throw new ApiError("booking_already_cancelled");
    }
    // Письмо гостю об отмене — побочный эффект. Если активность
    // удалена (`ON DELETE CASCADE` уже стёр строку), `getActivity`
    // вернёт `null`, и письмо уйдёт без названия. Это редкий
    // случай: после каскадного удаления `status` брони в БД уже
    // не действующий, отмена не имеет смысла, и гость не должен
    // был получить бронь от удалённой активности.
    const activity = getActivity(db, cancelled.activity_id);
    if (activity !== null) {
      void fastify.mailer.sendBookingCancelled(cancelled, activity);
    }
    return cancelled;
  });
};

// Проверяет, что слот с такой датой и временем начала в принципе
// присутствует в одном из расписаний активности. Занятость здесь не
// учитывается — это отдельная проверка в обработчике.
//
// Дороже, чем кажется: мы считаем все слоты на дату и сравниваем. Но
// дата у нас одна, и расписаний обычно немного (одна-две на
// активность), так что на практике это дёшево. Если в будущем
// производительность станет узким местом, можно либо индексировать,
// либо проверять только пересечение окна, без полного перебора.
function slotInSchedule(
  db: Db,
  activityId: number,
  date: string,
  startTime: string,
): boolean {
  const schedules = listSchedules(db, activityId);
  for (const schedule of schedules) {
    const slots = buildSlots(schedule, [], date, date);
    if (slots.some((s) => s.start_time === startTime)) {
      return true;
    }
  }
  return false;
}
