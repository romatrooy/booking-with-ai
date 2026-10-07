// Отправка писем гостю. AGENTS.md, раздел 5:
// "server/src/mailer.ts — отправка писем гостю".
//
// Решение зафиксировано в docs/adr/0005-smtp.md:
// - nodemailer + SMTP (по умолчанию Gmail `smtp.gmail.com:587`);
// - если SMTP_* не заданы, `mailer` это no-op, ошибка в лог;
// - письмо только гостю, в двух случаях: после создания брони
//   и после её отмены (гостевой или админской).
//
// Здесь нет SQL и нет работы с Fastify. Шаблоны — литералы в коде,
// plain-text + HTML, на русском.

import nodemailer, { type Transporter } from "nodemailer";
import type { SmtpConfig } from "./config.js";
import type { Activity, Booking } from "./schemas.js";

export interface Mailer {
  sendBookingCreated(booking: Booking, activity: Activity): Promise<void>;
  sendBookingCancelled(booking: Booking, activity: Activity): Promise<void>;
  // Используется в предупреждениях лога и в тестах.
  isEnabled(): boolean;
}

function createdBodyPlain(booking: Booking, activity: Activity): string {
  const dateHuman = formatDateHuman(booking.date);
  return [
    `Здравствуйте, ${booking.guest_name}!`,
    "",
    `Вы записались на встречу «${activity.name}».`,
    "",
    `Дата: ${dateHuman}`,
    `Время: ${booking.start_time.slice(0, 5)} (${activity.default_duration_minutes} мин)`,
    "",
    "Если у вас изменились планы — отмените бронь по прямой ссылке,",
    "которую прислал организатор. Если отменить не получится, напишите",
    "ему на адрес, указанный в форме записи.",
    "",
    "— Сервис бронирования",
  ].join("\n");
}

function createdBodyHtml(booking: Booking, activity: Activity): string {
  const dateHuman = formatDateHuman(booking.date);
  return [
    `<p>Здравствуйте, ${escapeHtml(booking.guest_name)}!</p>`,
    `<p>Вы записались на встречу «${escapeHtml(activity.name)}».</p>`,
    `<p>`,
    `Дата: ${escapeHtml(dateHuman)}<br>`,
    `Время: ${booking.start_time.slice(0, 5)} (${activity.default_duration_minutes} мин)`,
    `</p>`,
    `<p>Если у вас изменились планы — отмените бронь по прямой ссылке,`,
    `которую прислал организатор.</p>`,
    `<p>— Сервис бронирования</p>`,
  ].join("\n");
}

function cancelledBodyPlain(booking: Booking, activity: Activity): string {
  const dateHuman = formatDateHuman(booking.date);
  return [
    `Здравствуйте, ${booking.guest_name}!`,
    "",
    `Бронь на встречу «${activity.name}» отменена.`,
    "",
    `Дата: ${dateHuman}`,
    `Время: ${booking.start_time.slice(0, 5)}`,
    "",
    "Если это ошибка — свяжитесь с организатором.",
    "",
    "— Сервис бронирования",
  ].join("\n");
}

function cancelledBodyHtml(booking: Booking, activity: Activity): string {
  const dateHuman = formatDateHuman(booking.date);
  return [
    `<p>Здравствуйте, ${escapeHtml(booking.guest_name)}!</p>`,
    `<p>Бронь на встречу «${escapeHtml(activity.name)}» отменена.</p>`,
    `<p>`,
    `Дата: ${escapeHtml(dateHuman)}<br>`,
    `Время: ${booking.start_time.slice(0, 5)}`,
    `</p>`,
    `<p>Если это ошибка — свяжитесь с организатором.</p>`,
    `<p>— Сервис бронирования</p>`,
  ].join("\n");
}

export function buildMailer(config: SmtpConfig | null): Mailer {
  if (config === null) {
    // No-op: бронь и отмена продолжают работать без писем. Это
    // нужно и в dev-режиме, и в e2e-тестах, и для конфигураций
    // без SMTP.
    return {
      sendBookingCreated: async () => undefined,
      sendBookingCancelled: async () => undefined,
      isEnabled: () => false,
    };
  }

  // При 465 включаем `secure: true` (SSL с момента соединения),
  // при 587 — `secure: false` (Nodemailer сам поднимет STARTTLS).
  // Это типичная практика для Gmail.
  const transporter: Transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });

  // Обертка для `sendMail`: ошибку не пробрасываем. Бронь уже
  // в БД, ответ 200/201 клиенту уже ушёл. Письмо — побочный
  // эффект, его потеря не должна ломать API.
  const from = config.from;
  async function sendSafely(args: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void> {
    try {
      await transporter.sendMail({
        from,
        to: args.to,
        subject: args.subject,
        text: args.text,
        html: args.html,
      });
    } catch (error) {
      console.error(
        `mailer: не удалось отправить письмо ${args.to} (${args.subject}):`,
        error,
      );
    }
  }

  return {
    async sendBookingCreated(booking, activity) {
      await sendSafely({
        to: booking.guest_email,
        subject: `Запись на встречу «${activity.name}» подтверждена`,
        text: createdBodyPlain(booking, activity),
        html: createdBodyHtml(booking, activity),
      });
    },
    async sendBookingCancelled(booking, activity) {
      await sendSafely({
        to: booking.guest_email,
        subject: `Бронь на встречу «${activity.name}» отменена`,
        text: cancelledBodyPlain(booking, activity),
        html: cancelledBodyHtml(booking, activity),
      });
    },
    isEnabled() {
      return true;
    },
  };
}

// ─── Вспомогательные функции ─────────────────────────────────────────

// «2026-10-12» → «12 октября 2026». Без сторонних библиотек.
// По AGENTS.md §9 объект `Date` используется только для вычислений
// и только в UTC; здесь хватает простого разбора строки.
function formatDateHuman(date: string): string {
  const months = [
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
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (m === null) return date;
  const yyyy = m[1] ?? "";
  const mm = m[2] ?? "";
  const dd = m[3] ?? "";
  const monthIdx = Number.parseInt(mm, 10) - 1;
  const monthName = months[monthIdx] ?? "";
  return `${Number.parseInt(dd, 10)} ${monthName} ${yyyy}`;
}

// Минимальное экранирование HTML для шаблонов. Этого достаточно,
// потому что в шаблон подставляется пользовательский ввод (имя,
// название активности); остальные строки в шаблоне статичные.
function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}
