import { endOfWeekIso, formatIso, shiftWeekIso } from "../dates.ts";

interface Props {
  weekStart: string; // «ГГГГ-ММ-ДД», понедельник
  onChange: (nextStart: string) => void;
}

// Полоса со стрелками «предыдущая / следующая неделя» и заголовком
// вида «6 — 12 октября 2026». Кнопки сделаны настоящими `<button>`
// с `disabled`, а не ссылками.
export function WeekBar({ weekStart, onChange }: Props) {
  const today = new Date();
  const weekEnd = new Date(`${endOfWeekIso(weekStart)}T00:00:00Z`);
  // Прошлая неделя разрешена, только если её конец >= сегодня.
  const canPrev = weekEnd.getTime() >= startOfTodayUtcMs(today);

  return (
    <div className="week-bar">
      <button
        type="button"
        className="week-bar__nav"
        disabled={!canPrev}
        onClick={() => onChange(shiftWeekIso(weekStart, -1))}
        aria-label="Предыдущая неделя"
      >
        ‹
      </button>
      <span className="week-bar__label">
        {formatHumanRange(weekStart, endOfWeekIso(weekStart))}
      </span>
      <button
        type="button"
        className="week-bar__nav"
        onClick={() => onChange(shiftWeekIso(weekStart, 1))}
        aria-label="Следующая неделя"
      >
        ›
      </button>
    </div>
  );
}

function startOfTodayUtcMs(today: Date): number {
  return Date.parse(`${formatIso(today)}T00:00:00Z`);
}

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

function formatHumanRange(fromIso: string, toIso: string): string {
  const fromYear = Number.parseInt(fromIso.slice(0, 4), 10);
  const toYear = Number.parseInt(toIso.slice(0, 4), 10);
  const fromDay = Number.parseInt(fromIso.slice(8, 10), 10);
  const toDay = Number.parseInt(toIso.slice(8, 10), 10);
  const fromMonth = Number.parseInt(fromIso.slice(5, 7), 10) - 1;
  const toMonth = Number.parseInt(toIso.slice(5, 7), 10) - 1;
  if (fromYear === toYear) {
    return `${fromDay} ${MONTHS[fromMonth]} — ${toDay} ${MONTHS[toMonth]} ${fromYear}`;
  }
  return `${fromDay} ${MONTHS[fromMonth]} ${fromYear} — ${toDay} ${MONTHS[toMonth]} ${toYear}`;
}
