// Таблица всех броней для админ-режима. Сортировка по колонкам,
// кнопка «Отменить» в строке.

import { useMemo, useState } from "react";
import type { AdminBookingRow } from "../api.ts";
import { formatDateTime, shortTime } from "../dates.ts";

type SortKey =
  | "activity_name"
  | "date"
  | "start_time"
  | "guest_name"
  | "guest_email"
  | "status"
  | "created_at";
type SortDir = "asc" | "desc";

interface Props {
  rows: AdminBookingRow[];
  onCancel: (id: number) => Promise<void>;
}

export function AdminBookingsTable({ rows, onCancel }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const copy = rows.slice();
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function arrow(key: SortKey): string {
    if (key !== sortKey) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  async function handleCancel(id: number) {
    if (busyId !== null) return;
    setBusyId(id);
    setError(null);
    try {
      await onCancel(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отменить");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return <p className="admin-table__empty">Броней пока нет.</p>;
  }

  return (
    <div className="admin-table-wrapper">
      {error !== null ? (
        <p className="admin-table__error" role="alert">
          {error}
        </p>
      ) : null}
      <table className="admin-table">
        <thead>
          <tr>
            <th>
              <button type="button" onClick={() => toggleSort("activity_name")}>
                Активность{arrow("activity_name")}
              </button>
            </th>
            <th>
              <button type="button" onClick={() => toggleSort("date")}>
                Дата{arrow("date")}
              </button>
            </th>
            <th>
              <button type="button" onClick={() => toggleSort("start_time")}>
                Время{arrow("start_time")}
              </button>
            </th>
            <th>
              <button type="button" onClick={() => toggleSort("guest_name")}>
                Имя{arrow("guest_name")}
              </button>
            </th>
            <th>
              <button type="button" onClick={() => toggleSort("guest_email")}>
                Email{arrow("guest_email")}
              </button>
            </th>
            <th>
              <button type="button" onClick={() => toggleSort("status")}>
                Статус{arrow("status")}
              </button>
            </th>
            <th>
              <button type="button" onClick={() => toggleSort("created_at")}>
                Создана{arrow("created_at")}
              </button>
            </th>
            <th aria-label="Действия"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id}>
              <td>{row.activity_name}</td>
              <td>{row.date}</td>
              <td>{shortTime(row.start_time)}</td>
              <td>{row.guest_name}</td>
              <td>{row.guest_email}</td>
              <td>{row.status === "active" ? "Активна" : "Отменена"}</td>
              <td>{formatDateTime(row.created_at)}</td>
              <td>
                {row.status === "active" ? (
                  <button
                    type="button"
                    className="admin-table__cancel"
                    onClick={() => handleCancel(row.id)}
                    disabled={busyId !== null}
                  >
                    {busyId === row.id ? "Отменяем…" : "Отменить"}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
