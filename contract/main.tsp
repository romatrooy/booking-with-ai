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