// Попап с деталями брони. Появляется при клике на занятый слот
// в админ-сетке. Кнопка «Отменить» вызывает колбэк наверх.

import { useState } from "react";
import type { AdminBookingRow } from "../api.ts";
import { formatDateTime, shortTime } from "../dates.ts";

interface Props {
  booking: AdminBookingRow;
  onClose: () => void;
  onCancel: () => Promise<void>;
}

export function AdminSlotPopover({ booking, onClose, onCancel }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отменить");
      setSubmitting(false);
    }
  }

  return (
    <div className="popover-backdrop" role="presentation" onClick={onClose}>
      <div
        className="popover"
        role="dialog"
        aria-modal="true"
        aria-labelledby="popover-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="popover__header">
          <h3 id="popover-title">Бронь #{booking.id}</h3>
          <button
            type="button"
            className="popover__close"
            aria-label="Закрыть"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <dl className="popover__list">
          <dt>Активность</dt>
          <dd>{booking.activity_name}</dd>
          <dt>Дата</dt>
          <dd>{booking.date}</dd>
          <dt>Время</dt>
          <dd>{shortTime(booking.start_time)}</dd>
          <dt>Имя</dt>
          <dd>{booking.guest_name}</dd>
          <dt>Email</dt>
          <dd>{booking.guest_email}</dd>
          <dt>Создана</dt>
          <dd>{formatDateTime(booking.created_at)}</dd>
          <dt>Статус</dt>
          <dd>{booking.status === "active" ? "Активна" : "Отменена"}</dd>
        </dl>
        {booking.status === "active" ? (
          <>
            {error !== null ? (
              <p className="popover__error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              className="popover__cancel"
              onClick={handleCancel}
              disabled={submitting}
            >
              {submitting ? "Отменяем…" : "Отменить бронь"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
