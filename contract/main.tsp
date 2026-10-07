import "@typespec/http";
import "@typespec/rest";
using TypeSpec.Http;
using TypeSpec.Rest;

@service(#{ title: "Сервис бронирования тайм-слотов" })
namespace BookingService;

// ─── Доменные сущности ────────────────────────────────────────────────────────

model Activity {
  id: int32;

  @minLength(1)
  @maxLength(100)
  name: string;

  description?: string;

  @minValue(5)
  @maxValue(480)
  default_duration_minutes: int32;
}

model ActivityCreate {
  @minLength(1)
  @maxLength(100)
  name: string;

  description?: string;

  @minValue(5)
  @maxValue(480)
  default_duration_minutes: int32;
}

model Schedule {
  id: int32;
  activity_id: int32;

  weekdays: Weekday[];

  start_time: string;
  end_time: string;

  @minValue(5)
  @maxValue(480)
  duration_minutes: int32;
}

model ScheduleCreate {
  activity_id: int32;
  weekdays: Weekday[];
  start_time: string;
  end_time: string;

  @minValue(5)
  @maxValue(480)
  duration_minutes: int32;
}

enum Weekday {
  mon,
  tue,
  wed,
  thu,
  fri,
  sat,
  sun,
}

model Slot {
  activity_id: int32;
  date: string;
  start_time: string;

  @minValue(5)
  @maxValue(480)
  duration_minutes: int32;

  // Свободен ли слот для брони. После успешной брони соответствующий
  // слот остаётся в выдаче и приходит с `false`, чтобы интерфейс мог
  // показать его как занятый, а не «прятать». Гостевой бронью он снова
  // становится `true` только после отмены.
  is_free: boolean;
}

enum BookingStatus {
  active,
  cancelled,
}

model Booking {
  id: int32;
  activity_id: int32;
  date: string;
  start_time: string;

  @minLength(1)
  @maxLength(100)
  guest_name: string;

  @minLength(1)
  @maxLength(200)
  guest_email: string;

  status: BookingStatus;

  created_at: string;
}

model BookingCreate {
  activity_id: int32;
  date: string;
  start_time: string;

  @minLength(1)
  @maxLength(100)
  guest_name: string;

  @minLength(1)
  @maxLength(200)
  guest_email: string;
}

// ─── Ошибки ────────────────────────────────────────────────────────────────

@error
model ApiError {
  message: string;
}

@error
model ValidationError {
  message: string;
  details?: string;
}

// ─── Активности ─────────────────────────────────────────────────────────────

@route("/api/activities")
interface Activities {
  @get
  op list(): Activity[];

  @post
  op create(@body body: ActivityCreate):
    | {
        @statusCode statusCode: 201;
        @body body: Activity;
      }
    | ValidationError;
}

// ─── Расписания ──────────────────────────────────────────────────────────────

@route("/api/schedules")
interface Schedules {
  @get
  op list(@query activity_id?: int32): Schedule[];

  @post
  op create(@body body: ScheduleCreate):
    | {
        @statusCode statusCode: 201;
        @body body: Schedule;
      }
    | ValidationError;
}

// ─── Слоты ───────────────────────────────────────────────────────────────────

@route("/api/slots")
interface Slots {
  @get
  op list(
    @query activity_id: int32,
    @query date_from: string,
    @query date_to: string,
  ): Slot[] | ValidationError;
}

// ─── Брони ────────────────────────────────────────────────────────────────────

@route("/api/bookings")
interface Bookings {
  @get
  op list(): Booking[];

  @post
  op create(@body body: BookingCreate):
    | {
        @statusCode statusCode: 201;
        @body body: Booking;
      }
    | ValidationError
    | ApiError;

  @post
  @route("/{booking_id}/cancel")
  op cancel(
    @path booking_id: int32,
  ): Booking | ApiError;
}

// ─── Администратор ─────────────────────────────────────────────────────────
//
// Один логин и пароль из переменных окружения. Сессия в подписанной
// cookie `admin_session`, см. server/src/adminAuth.ts и ADR 0004.

@route("/api/admin")
namespace Admin {
  // Тело запроса на вход. Поля `login` и `password` проверяются на
  // сервере через bcryptjs (хранение в env, не в БД).
  model LoginRequest {
    @minLength(1)
    @maxLength(100)
    login: string;

    @minLength(1)
    @maxLength(200)
    password: string;
  }

  // Успешный ответ на вход. Поле `attempts_left` отдаётся и в
  // успехе, и в ошибке — клиенту нужно показывать «осталось N
  // попыток» в одном и том же модальном окне.
  model LoginResponse {
    ok: boolean;
    login: string;
    attempts_left: int32;
  }

  // Текущая сессия. Поле `logged_in` всегда присутствует, `login` —
  // только когда залогинен. Используется при загрузке страницы,
  // чтобы понять, открывать модалку или админ-режим.
  model MeResponse {
    logged_in: boolean;
    login?: string;
  }

  // Строка брони в админ-таблице. Расширяет `Booking` именем
  // активности, чтобы таблица была самодостаточной.
  model AdminBookingRow {
    id: int32;
    activity_id: int32;
    activity_name: string;
    date: string;
    start_time: string;
    guest_name: string;
    guest_email: string;
    status: BookingStatus;
    created_at: string;
  }

  // Тело ошибки админки. Код `unauthorized` один на все случаи:
  // нет cookie, неверный пароль, истёкшая сессия, превышен лимит
  // попыток. Поле `attempts_left` приходит только в ответе на
  // `/login` (успех или ошибка).
  @error
  model AdminError {
    code: "unauthorized";
    message: string;
    attempts_left?: int32;
  }

  @post
  @route("/login")
  op login(
    @body body: LoginRequest,
  ): {
    @statusCode statusCode: 200;
    @body body: LoginResponse;
  } | AdminError;

  @post
  @route("/logout")
  op logout(): {
    @statusCode statusCode: 200;
    @body body: { ok: boolean };
  };

  @get
  @route("/me")
  op me(): {
    @statusCode statusCode: 200;
    @body body: MeResponse;
  };

  @get
  @route("/bookings")
  op listBookings(
    @query activity_id?: int32,
    @query date_from?: string,
    @query date_to?: string,
  ): AdminBookingRow[] | AdminError;

  @get
  @route("/activities")
  op listActivities(): Activity[] | AdminError;

  @get
  @route("/schedules")
  op listSchedules(
    @query activity_id?: int32,
  ): Schedule[] | AdminError;

  // Отмена брони администратором. Повторяет путь гостевой отмены,
  // но требует валидной сессии администратора.
  @post
  @route("/bookings/{booking_id}/cancel")
  op cancelBooking(
    @path booking_id: int32,
  ): Booking | AdminError | ApiError;
}