// Zod-схемы для тел запросов и query-параметров. AGENTS.md, раздел 9:
// "Проверка входных данных делается схемами Zod прямо в обработчике
// вызовом `schema.parse(...)`. Схемы Fastify на JSON Schema сознательно
// не используются: тогда описание данных существовало бы в трёх видах
// (TypeSpec, JSON Schema, типы TypeScript), а так их два, и типы
// выводятся из схем через `z.infer`."
//
// Схемы повторяют модели из `contract/main.tsp` (Design First, шаг 3).
// Имена полей в `snake_case` — контракт так их называет.

import { z } from "zod";

// ─── Базовые литералы ────────────────────────────────────────────────────────

// Дата в формате «ГГГГ-ММ-ДД». Строгая проверка через `regex` и
// восстановление из строки, чтобы исключить лишние формы вроде
// "2025-1-1" (месяц и день должны быть двузначными).
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Дата должна быть в формате ГГГГ-ММ-ДД")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), {
    message: "Некорректная дата",
  });

// Время в формате «ЧЧ:ММ:СС». Секунды обязательны — это упрощает
// сравнение строк в SQL и в JS.
const timeString = z
  .string()
  .regex(/^\d{2}:\d{2}:\d{2}$/u, "Время должно быть в формате ЧЧ:ММ:СС");

// Дни недели — enum в `contract/main.tsp`. Список выписан здесь явно,
// потому что Zod в TS генерирует `z.enum` из массива строк-литералов.
const weekdaySchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

const weekdaysSchema = z
  .array(weekdaySchema)
  .min(1, "Должен быть указан хотя бы один день недели");

// ─── Activity ───────────────────────────────────────────────────────────────

// Создание активности: id нет (его выдаёт БД), description опционально.
export const activityCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  default_duration_minutes: z.number().int().min(5).max(480),
});

export type ActivityCreate = z.infer<typeof activityCreateSchema>;

// Чтение активности. id приходит из БД, описание может быть null в БД
// (поле необязательное), а в API отдаём `string | null` для ясности.
export const activitySchema = activityCreateSchema.extend({
  id: z.number().int().positive(),
  description: z.string().nullable(),
});

export type Activity = z.infer<typeof activitySchema>;

// ─── Schedule ───────────────────────────────────────────────────────────────

export const scheduleCreateSchema = z.object({
  activity_id: z.number().int().positive(),
  weekdays: weekdaysSchema,
  start_time: timeString,
  end_time: timeString,
  duration_minutes: z.number().int().min(5).max(480),
});

export type ScheduleCreate = z.infer<typeof scheduleCreateSchema>;

export const scheduleSchema = scheduleCreateSchema.extend({
  id: z.number().int().positive(),
});

export type Schedule = z.infer<typeof scheduleSchema>;

// ─── Slot ───────────────────────────────────────────────────────────────────

// `Slot` — это вычисляемое представление, в БД его нет. Но формат полей
// в API соответствует тому, что отдаёт обработчик слотов, и тоже
// проходит через Zod для единообразия.
export const slotSchema = z.object({
  activity_id: z.number().int().positive(),
  date: dateString,
  start_time: timeString,
  duration_minutes: z.number().int().min(5).max(480),
  is_free: z.boolean(),
});

export type Slot = z.infer<typeof slotSchema>;

// Query-параметры для `GET /api/slots`. `date_from` и `date_to`
// обязательны (см. README и `contract/main.tsp`).
export const slotsQuerySchema = z
  .object({
    activity_id: z.coerce.number().int().positive(),
    date_from: dateString,
    date_to: dateString,
  })
  .refine((q) => q.date_from <= q.date_to, {
    message: "Дата `date_from` должна быть не позже `date_to`",
    path: ["date_to"],
  })
  .refine(
    (q) => {
      const from = Date.parse(`${q.date_from}T00:00:00Z`);
      const to = Date.parse(`${q.date_to}T00:00:00Z`);
      const days = (to - from) / 86_400_000 + 1;
      return days <= 60;
    },
    {
      message: "Диапазон не должен превышать 60 дней",
      path: ["date_to"],
    },
  );

export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

// ─── Booking ────────────────────────────────────────────────────────────────

export const bookingCreateSchema = z.object({
  activity_id: z.number().int().positive(),
  date: dateString,
  start_time: timeString,
  guest_name: z.string().min(1).max(100),
  guest_email: z.string().email().max(200),
});

export type BookingCreate = z.infer<typeof bookingCreateSchema>;

export const bookingSchema = bookingCreateSchema.extend({
  id: z.number().int().positive(),
  status: z.enum(["active", "cancelled"]),
  created_at: z.string(),
});

export type Booking = z.infer<typeof bookingSchema>;

// Query-параметры для `GET /api/bookings`. `guest_email` опционален,
// фильтрует по подстроке (простое `LIKE`).
export const bookingsQuerySchema = z.object({
  guest_email: z.string().email().optional(),
});

export type BookingsQuery = z.infer<typeof bookingsQuerySchema>;

// `bookingIdParam` — `booking_id` в URL `POST /api/bookings/{booking_id}/cancel`.
export const bookingIdParamSchema = z.object({
  booking_id: z.coerce.number().int().positive(),
});

export type BookingIdParam = z.infer<typeof bookingIdParamSchema>;

// ─── Admin ──────────────────────────────────────────────────────────────────

// Тело запроса на вход администратора. Логин сравнивается как
// обычная строка, пароль — через `bcryptjs.compare` с хешем, который
// сервер считает при старте из `BOOKING_ADMIN_PASSWORD`.
export const adminLoginSchema = z.object({
  login: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export type AdminLogin = z.infer<typeof adminLoginSchema>;

// Параметры фильтра для `GET /api/admin/bookings`. Все опциональны.
// Даты валидируются тем же `dateString`, что и для гостевых
// эндпоинтов. Диапазон ≤60 дней не проверяем здесь — для
// админ-таблицы это лишнее ограничение.
export const adminBookingsQuerySchema = z.object({
  activity_id: z.coerce.number().int().positive().optional(),
  date_from: dateString.optional(),
  date_to: dateString.optional(),
});

export type AdminBookingsQuery = z.infer<typeof adminBookingsQuerySchema>;

// Строка в админ-таблице. `activity_name` приходит из JOIN с
// `activities` в `repository.listBookingsForAdmin`.
export const adminBookingRowSchema = z.object({
  id: z.number().int().positive(),
  activity_id: z.number().int().positive(),
  activity_name: z.string(),
  date: dateString,
  start_time: timeString,
  guest_name: z.string().min(1).max(100),
  guest_email: z.string().min(1).max(200),
  status: z.enum(["active", "cancelled"]),
  created_at: z.string(),
});

export type AdminBookingRow = z.infer<typeof adminBookingRowSchema>;
