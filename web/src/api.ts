// Обращения к API. Типы повторяют модели контракта
// (`contract/main.tsp`, AGENTS.md §5). Если контракт меняется —
// правим типы здесь и в соответствующих местах UI.
//
// Все запросы идут на тот же origin, что и страница: в dev-режиме
// Vite проксирует `/api` на сервис Fastify, в собранном виде —
// сервис сам отдаёт web/dist, и прокси не нужен.

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface Activity {
  id: number;
  name: string;
  description: string | null;
  default_duration_minutes: number;
}

export interface Slot {
  activity_id: number;
  date: string;
  start_time: string;
  duration_minutes: number;
  is_free: boolean;
}

export type BookingStatus = "active" | "cancelled";

export interface Booking {
  id: number;
  activity_id: number;
  date: string;
  start_time: string;
  guest_name: string;
  guest_email: string;
  status: BookingStatus;
  created_at: string;
}

// Коды ошибок совпадают с `server/src/errors.ts`. Сообщения
// приходят в теле ответа и уже локализованы сервером.
export interface ApiErrorBody {
  code:
    | "activity_not_found"
    | "booking_not_found"
    | "slot_taken"
    | "booking_already_cancelled"
    | "validation_failed"
    | "slot_not_found"
    | "invalid_time_window"
    | "invalid_date_range";
  message: string;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly body: ApiErrorBody;
  public constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  method: "GET" | "POST",
  url: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  if (!res.ok) {
    let parsed: ApiErrorBody;
    try {
      parsed = (await res.json()) as ApiErrorBody;
    } catch {
      throw new ApiError(res.status, {
        code: "validation_failed",
        message: `Сервер вернул ${res.status} ${res.statusText}`,
      });
    }
    throw new ApiError(res.status, parsed);
  }
  return (await res.json()) as T;
}

export function listActivities(): Promise<Activity[]> {
  return request<Activity[]>("GET", "/api/activities");
}

export interface SlotsQuery {
  activity_id: number;
  date_from: string;
  date_to: string;
}

export function listSlots(query: SlotsQuery): Promise<Slot[]> {
  const params = new URLSearchParams({
    activity_id: String(query.activity_id),
    date_from: query.date_from,
    date_to: query.date_to,
  });
  return request<Slot[]>("GET", `/api/slots?${params.toString()}`);
}

export interface BookingCreate {
  activity_id: number;
  date: string;
  start_time: string;
  guest_name: string;
  guest_email: string;
}

export function createBooking(input: BookingCreate): Promise<Booking> {
  return request<Booking>("POST", "/api/bookings", input);
}

export function cancelBooking(booking_id: number): Promise<Booking> {
  return request<Booking>(
    "POST",
    `/api/bookings/${booking_id}/cancel`,
  );
}

export function listBookings(guest_email?: string): Promise<Booking[]> {
  const url =
    guest_email && guest_email.length > 0
      ? `/api/bookings?guest_email=${encodeURIComponent(guest_email)}`
      : "/api/bookings";
  return request<Booking[]>("GET", url);
}