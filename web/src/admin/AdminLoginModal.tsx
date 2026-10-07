// Модалка входа для администратора. Поведение согласовано:
// - поверх главной с полупрозрачным фоном;
// - закрывается по «×», `Escape` и клику вне формы;
// - показывает «осталось N попыток» при неверном пароле.

import { useEffect, useState } from "react";
import { adminLogin, ApiError } from "../api.ts";

interface Props {
  onClose: () => void;
  onSuccess: (login: string) => void;
}

export function AdminLoginModal({ onClose, onSuccess }: Props) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);

  // Закрытие по Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await adminLogin(login, password);
      setAttemptsLeft(result.attempts_left);
      onSuccess(result.login);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.body.message);
        if (err.body.attempts_left !== undefined) {
          setAttemptsLeft(err.body.attempts_left);
        }
      } else {
        setError("Не удалось войти");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-login-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="admin-login-title">Вход для администратора</h2>
          <button
            type="button"
            className="modal__close"
            aria-label="Закрыть"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <form className="modal__form" onSubmit={handleSubmit}>
          <label className="modal__field">
            <span>Логин</span>
            <input
              type="text"
              value={login}
              required
              autoFocus
              autoComplete="username"
              onChange={(e) => setLogin(e.target.value)}
            />
          </label>
          <label className="modal__field">
            <span>Пароль</span>
            <input
              type="password"
              value={password}
              required
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error !== null ? (
            <p className="modal__error" role="alert">
              {error}
              {attemptsLeft !== null
                ? ` Осталось ${attemptsLeft} ${pluralizeAttempt(attemptsLeft)}.`
                : ""}
            </p>
          ) : null}
          <button
            type="submit"
            className="modal__submit"
            disabled={submitting || login.length === 0 || password.length === 0}
          >
            {submitting ? "Отправляем…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}

// Склоняем «попытка / попытки / попыток» по числу.
function pluralizeAttempt(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "попытка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return "попытки";
  }
  return "попыток";
}
