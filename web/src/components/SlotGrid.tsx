import type { Slot } from "../api.ts";
import {
  dayOfMonthShort,
  shortTime,
  startOfWeekIso,
  weekdayShortForDate,
} from "../dates.ts";

interface Props {
  weekStart: string; // понедельник «ГГГГ-ММ-ДД»
  slots: Slot[];
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
}

// Сетка слотов на неделю: 7 колонок (дни) с временами начала внутри.
// Свободные слоты кликабельны, занятые — серые и не реагируют.
export function SlotGrid({ weekStart, slots, selected, onSelect }: Props) {
  const base = startOfWeekIso(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(base, i));
  const byDay = groupByDay(slots);

  return (
    <div className="slot-grid" role="grid" aria-label="Слоты на неделю">
      {days.map((date) => {
        const daySlots = byDay.get(date) ?? [];
        return (
          <div key={date} className="slot-grid__day" role="gridcell">
            <div className="slot-grid__day-header">
              <span className="slot-grid__weekday">
                {weekdayShortForDate(date)}
              </span>
              <span className="slot-grid__day-number">
                {dayOfMonthShort(date)}
              </span>
            </div>
            <ul className="slot-grid__list">
              {daySlots.length === 0 ? (
                <li className="slot-grid__empty">—</li>
              ) : (
                daySlots.map((s) => (
                  <li key={`${s.date} ${s.start_time}`}>
                    <button
                      type="button"
                      className={slotClassName(s, selected)}
                      disabled={!s.is_free}
                      aria-pressed={
                        selected?.date === s.date &&
                        selected?.start_time === s.start_time
                      }
                      onClick={() => {
                        if (s.is_free) onSelect(s);
                      }}
                    >
                      {shortTime(s.start_time)}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function slotClassName(s: Slot, selected: Slot | null): string {
  const base = "slot-grid__button";
  if (!s.is_free) return `${base} slot-grid__button--busy`;
  const isSelected =
    selected !== null &&
    selected.date === s.date &&
    selected.start_time === s.start_time;
  if (isSelected) return `${base} slot-grid__button--selected`;
  return `${base} slot-grid__button--free`;
}

function groupByDay(slots: Slot[]): Map<string, Slot[]> {
  const m = new Map<string, Slot[]>();
  for (const s of slots) {
    const arr = m.get(s.date) ?? [];
    arr.push(s);
    m.set(s.date, arr);
  }
  // Сортируем слоты по времени начала внутри каждого дня.
  for (const arr of m.values()) {
    arr.sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
  }
  return m;
}

function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
