// Работа с датами и временем. Даты — строки «ГГГГ-ММ-ДД», время —
// строки «ЧЧ:ММ:СС». Объект `Date` используется только для
// арифметики и только в UTC (AGENTS.md §9).

// Дата текущего дня в формате «ГГГГ-ММ-ДД» (UTC).
export function todayIso(): string {
  return formatIso(new Date());
}

// «ГГГГ-ММ-ДД» для переданной `Date` (UTC).
export function formatIso(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Понедельник недели, в которую попадает `dateIso`. Результат —
// строка «ГГГГ-ММ-ДД».
export function startOfWeekIso(dateIso: string): string {
  const d = parseIsoUtc(dateIso);
  // getUTCDay: 0 = воскресенье, 1 = понедельник. Сдвигаем так,
  // чтобы понедельник был 0.
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return formatIso(d);
}

// Воскресенье той же недели (конец недели, включительно).
export function endOfWeekIso(dateIso: string): string {
  const d = parseIsoUtc(startOfWeekIso(dateIso));
  d.setUTCDate(d.getUTCDate() + 6);
  return formatIso(d);
}

// Сдвиг недели: `delta = -1` — прошлая, `delta = 1` — следующая.
export function shiftWeekIso(dateIso: string, delta: number): string {
  const d = parseIsoUtc(startOfWeekIso(dateIso));
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return formatIso(d);
}

// Русские короткие названия дней недели для понедельника…воскресенья.
const WEEKDAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const WEEKDAY_INDEX = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
} as const;

export function weekdayShortForDate(dateIso: string): string {
  const d = parseIsoUtc(dateIso);
  const idx = (d.getUTCDay() + 6) % 7; // понедельник = 0
  return WEEKDAY_SHORT[idx] ?? "";
}

// День месяца без ведущего нуля, например «7» для «2026-10-07».
export function dayOfMonthShort(dateIso: string): string {
  return dateIso.slice(8, 10).replace(/^0/u, "");
}

// «ЧЧ:ММ» из «ЧЧ:ММ:СС».
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

export function getWeekdayIndex(w: string): number {
  return WEEKDAY_INDEX[w as keyof typeof WEEKDAY_INDEX];
}

function parseIsoUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}