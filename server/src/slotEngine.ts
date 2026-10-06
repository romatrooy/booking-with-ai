// Чистые функции расчёта слотов. AGENTS.md, раздел 5:
// "server/src/slotEngine.ts — вычисление слотов, чистые функции без базы".
// AGENTS.md, раздел 9:
// "Даты это строки «ГГГГ-ММ-ДД», время это строки «ЧЧ:ММ:СС». Объект `Date`
// используется только для вычислений и только в UTC: иначе результат
// зависел бы от часового пояса машины."
//
// Поведение: для заданного расписания и списка занятых слотов
// (`activity_id`+`date`+`start_time`) вернуть массив свободных слотов в
// диапазоне дат.

import type { Schedule, Slot } from "./schemas.js";

// 1 = понедельник, 7 = воскресенье. Совпадает с `Date.getUTCDay()` за
// исключением того, что `getUTCDay()` возвращает 0 = воскресенье.
const weekdayIndex: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

// Разбор «ЧЧ:ММ:СС» в число минут от начала суток. Бросает Error, если
// строка не подходит. Это внутренний помощник, не часть публичного API.
export function parseTimeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/u.exec(value);
  if (!match) {
    throw new Error(`Некорректное время: ${value}`);
  }
  const [, hh, mm] = match;
  return Number.parseInt(hh ?? "0", 10) * 60 + Number.parseInt(mm ?? "0", 10);
}

// Форматирование числа минут обратно в «ЧЧ:ММ:СС». Это обратная операция
// к `parseTimeToMinutes`; используется при переборе слотов в окне.
export function formatMinutesToTime(totalMinutes: number): string {
  const hh = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const mm = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:00`;
}

// Преобразование «ГГГГ-ММ-ДД» в `Date` на полночь по UTC. Используется
// только для арифметики дней; наружу объект `Date` не уходит.
function dateToUtcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function formatUtcMidnight(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Содержимое одной строки в `bookings`, нужное только для фильтрации
// свободных слотов. Слот занят, если бронь со статусом `active` и
// совпадает по `activity_id`, `date`, `start_time`. Здесь мы
// принимаем минимальный набор полей, чтобы функция была пригодна и в
// тестах, и в проде.
export interface BusySlot {
  readonly activity_id: number;
  readonly date: string;
  readonly start_time: string;
}

// Превращает расписание в набор слотов на одну конкретную дату. Использует
// длительность расписания; активная длительность активности (если она
// задана) здесь не учитывается, потому что в `Schedule.duration_minutes`
// уже зафиксировано окончательное значение.
//
// Окно: `[start_time, end_time - duration_minutes]` включительно с обеих
// сторон. Шаг: `duration_minutes`. То есть слот начинается в `start_time`,
// затем `start_time + duration_minutes`, и так далее, пока начало
// очередного слота плюс длительность не выйдет за `end_time`.
function slotsForDate(schedule: Schedule, date: string): string[] {
  // День недели: 1..7 (пн..вс). Если день не входит в расписание —
  // слоты на эту дату не генерируются.
  const weekdayNum = dateToUtcMidnight(date).getUTCDay();
  // `getUTCDay()` отдаёт 0 = воскресенье, 1 = понедельник. Нормализуем
  // к 1..7, где 7 — воскресенье.
  const normalizedWeekday = weekdayNum === 0 ? 7 : weekdayNum;
  const matchesWeekday = schedule.weekdays.some(
    (w) => weekdayIndex[w] === normalizedWeekday,
  );
  if (!matchesWeekday) return [];

  const startMinutes = parseTimeToMinutes(schedule.start_time);
  const endMinutes = parseTimeToMinutes(schedule.end_time);
  if (endMinutes <= startMinutes) return [];
  if (endMinutes - startMinutes < schedule.duration_minutes) return [];

  const result: string[] = [];
  for (
    let t = startMinutes;
    t + schedule.duration_minutes <= endMinutes;
    t += schedule.duration_minutes
  ) {
    result.push(formatMinutesToTime(t));
  }
  return result;
}

// Главная функция: собрать свободные слоты на диапазон дат. Принимает
// расписание, диапазон и список занятых слотов — всё это «факты», а не
// «запросы к базе». Поэтому тесты могут подсунуть свои.
export function buildSlots(
  schedule: Schedule,
  busySlots: readonly BusySlot[],
  dateFrom: string,
  dateTo: string,
): Slot[] {
  const busy = new Set(
    busySlots
      .filter((b) => b.activity_id === schedule.activity_id)
      .map((b) => `${b.date} ${b.start_time}`),
  );

  const result: Slot[] = [];
  const from = dateToUtcMidnight(dateFrom);
  const to = dateToUtcMidnight(dateTo);
  // Идём по дням включительно.
  for (
    let d = from;
    d.getTime() <= to.getTime();
    d = new Date(d.getTime() + 86_400_000)
  ) {
    const date = formatUtcMidnight(d);
    const startTimes = slotsForDate(schedule, date);
    for (const startTime of startTimes) {
      if (busy.has(`${date} ${startTime}`)) continue;
      result.push({
        activity_id: schedule.activity_id,
        date,
        start_time: startTime,
        duration_minutes: schedule.duration_minutes,
      });
    }
  }
  return result;
}

// Преобразование массива `weekdays` в JSON-строку, как мы храним в БД.
// Не зависит ни от чего, кроме массива, и потому лежит здесь, а не в
// `repository.ts` — тестам `slotEngine.test.ts` тоже пригодится.
export function weekdaysToJson(weekdays: readonly string[]): string {
  return JSON.stringify(weekdays);
}

export function weekdaysFromJson(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("weekdays в БД не является массивом");
  }
  // Не делаем строгую проверку содержимого: Zod проверит его при чтении.
  return parsed.map((v) => String(v));
}
