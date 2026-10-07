// Сетка слотов для админ-режима. Отличается от `SlotGrid` тем,
// что под занятым слотом показывает «Имя · email» и по клику
// открывает попап с полной информацией.

import { useState } from "react";
import type { AdminBookingRow, Slot } from "../api.ts";
import {
  dayOfMonthShort,
  shortTime,
  startOfWeekIso,
  weekdayShortForDate,
} from "../dates.ts";
import { AdminSlotPopover } from "./AdminSlotPopover.tsx";

interface Props {
  weekStart: string;
  slots: Slot[];
  // Сюда передаём все брони активности — по ним находим запись
  // для занятого слота, чтобы показать имя/email.
  bookings: AdminBookingRow[];
  onCancel: (bookingId: number) => Promise<void>;
}

export function AdminSlotGrid({ weekStart, slots, bookings, onCancel }: Props) {
  const [popoverBooking, setPopoverBooking] = useState<AdminBookingRow | null>(
    null,
  );

  const base = startOfWeekIso(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(base, i));
  const byDay = groupByDay(slots);
  // Карта «дата время → бронь» для подписей под занятыми слотами.
  const bookingByKey = new Map<string, AdminBookingRow>();
  for (const b of bookings) {
    if (b.status !== "active") continue;
    bookingByKey.set(`${b.date} ${b.start_time}`, b);
  }

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
                daySlots.map((s) => {
                  const booking = s.is_free
                    ? undefined
                    : bookingByKey.get(`${s.date} ${s.start_time}`);
                  return (
                    <li key={`${s.date} ${s.start_time}`}>
                      {s.is_free ? (
                        <span className="slot-grid__button slot-grid__button--free">
                          {shortTime(s.start_time)}
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="slot-grid__button slot-grid__button--busy"
                            onClick={() => {
                              if (booking !== undefined) {
                                setPopoverBooking(booking);
                              }
                            }}
                            aria-label={`Бронь ${s.start_time}`}
                          >
                            {shortTime(s.start_time)}
                          </button>
                          {booking !== undefined ? (
                            <div
                              className="slot-grid__booking"
                              title={`${booking.guest_name} · ${booking.guest_email}`}
                            >
                              {booking.guest_name} · {booking.guest_email}
                            </div>
                          ) : null}
                        </>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        );
      })}
      {popoverBooking !== null ? (
        <AdminSlotPopover
          booking={popoverBooking}
          onClose={() => setPopoverBooking(null)}
          onCancel={async () => {
            await onCancel(popoverBooking.id);
            setPopoverBooking(null);
          }}
        />
      ) : null}
    </div>
  );
}

function groupByDay(slots: Slot[]): Map<string, Slot[]> {
  const m = new Map<string, Slot[]>();
  for (const s of slots) {
    const arr = m.get(s.date) ?? [];
    arr.push(s);
    m.set(s.date, arr);
  }
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
