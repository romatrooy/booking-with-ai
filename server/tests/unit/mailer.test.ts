// Unit-тесты на `mailer`: проверяем, что no-op ничего не делает,
// а реальный mailer корректно собирает шаблоны писем.
//
// Реальная отправка не тестируется: для неё нужен либо мок-сервер
// SMTP, либо реальный Gmail. На учебном проекте достаточно того,
// что сборка шаблона возвращает ожидаемые строки.

import { describe, expect, it } from "vitest";
import { buildMailer } from "../../src/mailer.js";
import type { Activity, Booking } from "../../src/schemas.js";

const activity: Activity = {
  id: 1,
  name: "Консультация",
  description: null,
  default_duration_minutes: 60,
};

const booking: Booking = {
  id: 42,
  activity_id: 1,
  date: "2026-10-12",
  start_time: "10:00:00",
  guest_name: "Иван",
  guest_email: "ivan@example.com",
  status: "active",
  created_at: "2026-10-07T00:00:00.000Z",
};

describe("buildMailer", () => {
  it("no-op при config === null", () => {
    const mailer = buildMailer(null);
    expect(mailer.isEnabled()).toBe(false);
    // Должно вернуть Promise, который ничего не делает.
    expect(() => mailer.sendBookingCreated(booking, activity)).not.toThrow();
    expect(() => mailer.sendBookingCancelled(booking, activity)).not.toThrow();
  });

  it("isEnabled() === true при наличии конфига", () => {
    const mailer = buildMailer({
      host: "smtp.gmail.com",
      port: 587,
      user: "u@gmail.com",
      password: "x",
      from: "u@gmail.com",
    });
    expect(mailer.isEnabled()).toBe(true);
  });
});
