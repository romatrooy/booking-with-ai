// Состояние экрана. Здесь живут четыре «управляющих» значения:
//  - выбранная активность (id);
//  - понедельник текущей недели;
//  - выбранный слот;
//  - текущий экран (главный или политика конфиденциальности).
//
// Все остальные компоненты получают их сверху и не хранят
// собственную копию. Это упрощает рассуждение о том, что видит
// пользователь, и устраняет синхронизацию между полями формы и
// сеткой.
//
// Роутинг — простой, без библиотек. URL в адресной строке
// обновляется через `history.pushState`, чтобы пользователь мог
// перейти по прямой ссылке и вернуться назад через кнопку браузера.
// На сервере SPA-fallback уже настроен в `server/src/app.ts`.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createBooking,
  listActivities,
  listSlots,
  type Slot,
} from "./api.ts";
import { endOfWeekIso, startOfWeekIso, todayIso } from "./dates.ts";
import { useLoader } from "./hooks.ts";
import { ActivityPicker } from "./components/ActivityPicker.tsx";
import { WeekBar } from "./components/WeekBar.tsx";
import { SlotGrid } from "./components/SlotGrid.tsx";
import { BookingPanel } from "./components/BookingPanel.tsx";
import { Privacy } from "./privacy/Privacy.tsx";

// Маршруты приложения. Один экран — один путь. Закрытый союз
// `Route` страхует от опечаток: при добавлении экрана TypeScript
// попросит обработать его в `Screen` ниже.
type Route = "main" | "privacy";

function readRoute(): Route {
  if (typeof window === "undefined") return "main";
  const path = window.location.pathname;
  if (path === "/privacy") return "privacy";
  return "main";
}

export function App() {
  // Начальная неделя — текущая (её понедельник).
  const initialWeek = useMemo(() => startOfWeekIso(todayIso()), []);
  const [activityId, setActivityId] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState<string>(initialWeek);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [route, setRoute] = useState<Route>(() => readRoute());

  // Синхронизируем состояние экрана с адресной строкой: клик по
  // «назад» в браузере должен возвращать на главную. Без
  // `popstate` пользователь застрял бы на `/privacy`.
  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((next: Route) => {
    const path = next === "privacy" ? "/privacy" : "/";
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setRoute(next);
  }, []);

  const activities = useLoader(
    () => listActivities(),
    [],
  );

  // Выбираем первую активность по умолчанию, когда список приходит.
  useEffect(() => {
    if (
      activityId === null &&
      activities.data !== null &&
      activities.data.length > 0
    ) {
      const first = activities.data[0];
      if (first !== undefined) setActivityId(first.id);
    }
  }, [activities.data, activityId]);

  const dateFrom = weekStart;
  const dateTo = endOfWeekIso(weekStart);

  const slots = useLoader(
    async () => {
      if (activityId === null) return [];
      return listSlots({ activity_id: activityId, date_from: dateFrom, date_to: dateTo });
    },
    [activityId, dateFrom, dateTo],
  );

  // При смене активности или недели сбрасываем выбор слота: слот
  // относится к конкретному дню и активности, и в новом контексте
  // он уже не актуален.
  useEffect(() => {
    setSelected(null);
  }, [activityId, weekStart]);

  if (route === "privacy") {
    return <Privacy onBack={() => navigate("main")} />;
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>Запись на встречу</h1>
        {activities.status === "error" ? (
          <p className="app__error" role="alert">
            Не удалось получить список активностей: {activities.error}
          </p>
        ) : null}
      </header>

      <section className="app__section">
        <h2>Активность</h2>
        <ActivityPicker
          activities={activities.data ?? []}
          selectedId={activityId}
          onSelect={setActivityId}
        />
      </section>

      <section className="app__section">
        <WeekBar weekStart={weekStart} onChange={setWeekStart} />
        {slots.status === "loading" ? (
          <p className="app__hint">Загружаем слоты…</p>
        ) : null}
        {slots.status === "error" ? (
          <p className="app__error" role="alert">
            {slots.error}
          </p>
        ) : null}
        <SlotGrid
          weekStart={weekStart}
          slots={slots.data ?? []}
          selected={selected}
          onSelect={setSelected}
        />
      </section>

      <BookingPanel
        slot={selected}
        onBook={async (input) => {
          if (selected === null || activityId === null) {
            throw new Error("Не выбран слот");
          }
          const booking = await createBooking({
            activity_id: activityId,
            date: selected.date,
            start_time: selected.start_time,
            guest_name: input.guest_name,
            guest_email: input.guest_email,
          });
          slots.reload();
          return booking;
        }}
        onCancel={() => setSelected(null)}
        onShowPrivacy={() => navigate("privacy")}
      />

      <footer className="app__footer">
        <button
          type="button"
          className="app__footer-link"
          onClick={() => navigate("privacy")}
        >
          Политика конфиденциальности
        </button>
      </footer>
    </div>
  );
}