// Главный экран админ-режима. Слева — выбор активности, неделя
// и сетка слотов с подписями. Справа — таблица всех броней.
// Сверху — кнопка «Выйти» (вызывает `onLogout` наверх).

import { useState } from "react";
import {
  cancelAdminBooking,
  listAdminActivities,
  listAdminBookings,
  listSlots,
  type AdminBookingRow,
  type Activity,
  type Slot,
} from "../api.ts";
import { endOfWeekIso, startOfWeekIso, todayIso } from "../dates.ts";
import { useLoader } from "../hooks.ts";
import { ActivityPicker } from "../components/ActivityPicker.tsx";
import { WeekBar } from "../components/WeekBar.tsx";
import { AdminSlotGrid } from "./AdminSlotGrid.tsx";
import { AdminBookingsTable } from "./AdminBookingsTable.tsx";

interface Props {
  login: string;
  onLogout: () => void;
}

export function AdminView({ login, onLogout }: Props) {
  const initialWeek = startOfWeekIso(todayIso());
  const [activityId, setActivityId] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState<string>(initialWeek);
  // Список броней выбранной активности — для подписей под занятыми
  // слотами. Таблица справа показывает все брони.
  const [activityBookings, setActivityBookings] = useState<AdminBookingRow[]>(
    [],
  );

  const activities = useLoader(() => listAdminActivities(), []);

  // Выбираем первую активность по умолчанию.
  if (
    activityId === null &&
    activities.data !== null &&
    activities.data.length > 0
  ) {
    const first = activities.data[0];
    if (first !== undefined) {
      setActivityId(first.id);
    }
  }

  const dateFrom = weekStart;
  const dateTo = endOfWeekIso(weekStart);

  const slots = useLoader(async () => {
    if (activityId === null) return [];
    return listSlots({
      activity_id: activityId,
      date_from: dateFrom,
      date_to: dateTo,
    });
  }, [activityId, dateFrom, dateTo]);

  // Брони выбранной активности — нужны для подписей в сетке.
  // Перезагружаем при смене активности и при отмене.
  const allBookings = useLoader(() => listAdminBookings(), []);

  // Синхронизируем `activityBookings` с `allBookings.data`.
  if (allBookings.data !== null && activityId !== null) {
    const filtered = allBookings.data.filter(
      (b) => b.activity_id === activityId,
    );
    if (filtered.length !== activityBookings.length) {
      setActivityBookings(filtered);
    } else {
      // Проверяем, что содержимое совпадает (после отмены).
      const same =
        filtered.length === activityBookings.length &&
        filtered.every((b, i) => {
          const prev = activityBookings[i];
          return (
            prev !== undefined && prev.id === b.id && prev.status === b.status
          );
        });
      if (!same) setActivityBookings(filtered);
    }
  }

  async function handleCancel(bookingId: number) {
    await cancelAdminBooking(bookingId);
    // Обновляем оба списка.
    allBookings.reload();
    slots.reload();
  }

  const activitiesList: Activity[] = activities.data ?? [];
  const slotsList: Slot[] = slots.data ?? [];
  const allRows: AdminBookingRow[] = allBookings.data ?? [];

  return (
    <div className="app">
      <header className="app__header">
        <h1>Администратор: {login}</h1>
        <button type="button" className="app__header-action" onClick={onLogout}>
          Выйти
        </button>
      </header>

      <section className="app__section">
        <h2>Активность</h2>
        <ActivityPicker
          activities={activitiesList}
          selectedId={activityId}
          onSelect={setActivityId}
        />
      </section>

      <section className="app__section">
        <h2>Слоты на неделю</h2>
        <WeekBar weekStart={weekStart} onChange={setWeekStart} />
        {slots.status === "loading" ? (
          <p className="app__hint">Загружаем слоты…</p>
        ) : null}
        {slots.status === "error" ? (
          <p className="app__error" role="alert">
            {slots.error}
          </p>
        ) : null}
        <AdminSlotGrid
          weekStart={weekStart}
          slots={slotsList}
          bookings={activityBookings}
          onCancel={handleCancel}
        />
      </section>

      <section className="app__section">
        <h2>Все брони</h2>
        {allBookings.status === "loading" ? (
          <p className="app__hint">Загружаем брони…</p>
        ) : null}
        {allBookings.status === "error" ? (
          <p className="app__error" role="alert">
            {allBookings.error}
          </p>
        ) : null}
        <AdminBookingsTable rows={allRows} onCancel={handleCancel} />
      </section>
    </div>
  );
}
