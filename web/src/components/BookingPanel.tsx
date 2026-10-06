import { useState } from "react";
import type { Slot, Booking } from "../api.ts";
import { shortTime } from "../dates.ts";

interface Props {
  slot: Slot | null;
  onBook: (input: {
    guest_name: string;
    guest_email: string;
  }) => Promise<Booking>;
  onCancel: () => void;
}

// Правая колонка: форма записи. Пока слот не выбран — просит
// выбрать. После создания брони показывает карточку с кнопкой
// «Отменить». Состояние «бронирование» и ошибка хранятся здесь, чтобы
// `App` не нужно было управлять промежуточными значениями.
export function BookingPanel({ slot, onBook, onCancel }: Props) {
  if (slot === null) {
    return (
      <aside className="booking-panel">
        <h2>Выберите слот</h2>
        <p className="booking-panel__hint">
          Кликните по свободному времени слева, чтобы записаться.
        </p>
      </aside>
    );
  }
  return <BookForm slot={slot} onBook={onBook} onCancel={onCancel} />;
}

interface FormProps {
  slot: Slot;
  onBook: (input: { guest_name: string; guest_email: string }) => Promise<Booking>;
  onCancel: () => void;
}

function BookForm({ slot, onBook, onCancel }: FormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await onBook({ guest_name: name, guest_email: email });
      setBooking(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось записаться");
    } finally {
      setSubmitting(false);
    }
  }

  if (booking !== null) {
    return (
      <aside className="booking-panel">
        <h2>Вы записаны</h2>
        <p className="booking-panel__line">
          <span className="booking-panel__date">{booking.date}</span>
          <span className="booking-panel__time">
            {shortTime(booking.start_time)}
          </span>
        </p>
        <p className="booking-panel__hint">
          Бронь #{booking.id}. Сохраните письмо с подтверждением, когда
          оно появится.
        </p>
        <button
          type="button"
          className="booking-panel__cancel"
          onClick={onCancel}
        >
          Записать ещё
        </button>
      </aside>
    );
  }

  return (
    <aside className="booking-panel">
      <h2>Запись на встречу</h2>
      <p className="booking-panel__line">
        <span className="booking-panel__date">{slot.date}</span>
        <span className="booking-panel__time">{shortTime(slot.start_time)}</span>
        <span className="booking-panel__duration">
          {slot.duration_minutes} мин
        </span>
      </p>
      <form className="booking-panel__form" onSubmit={handleSubmit}>
        <label className="booking-panel__field">
          <span>Имя</span>
          <input
            type="text"
            value={name}
            required
            minLength={1}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="booking-panel__field">
          <span>Электронная почта</span>
          <input
            type="email"
            value={email}
            required
            maxLength={200}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {error !== null ? (
          <p className="booking-panel__error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="booking-panel__submit"
          disabled={submitting || name.length === 0 || email.length === 0}
        >
          {submitting ? "Отправляем…" : "Записаться"}
        </button>
      </form>
    </aside>
  );
}