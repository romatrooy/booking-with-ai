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
    | "invalid_date_range"
    | "unauthorized"
    | "route_not_found";
  message: string;
  // Только для админ-эндпоинтов: число оставшихся попыток входа.
  attempts_left?: number;
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
  // По умолчанию отправляем cookie, чтобы админская сессия
  // работала и в dev-режиме (Vite-прокси), и в собранном виде
  // (тот же origin).
  credentials: RequestCredentials = "include",
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
    credentials,
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
  return request<Booking>("POST", `/api/bookings/${booking_id}/cancel`);
}

export function listBookings(guest_email?: string): Promise<Booking[]> {
  const url =
    guest_email && guest_email.length > 0
      ? `/api/bookings?guest_email=${encodeURIComponent(guest_email)}`
      : "/api/bookings";
  return request<Booking[]>("GET", url);
}

// ─── Admin ────────────────────────────────────────────────────────────────

export interface AdminBookingRow {
  id: number;
  activity_id: number;
  activity_name: string;
  date: string;
  start_time: string;
  guest_name: string;
  guest_email: string;
  status: BookingStatus;
  created_at: string;
}

export interface AdminLoginResponse {
  ok: boolean;
  login: string;
  attempts_left: number;
}

export interface AdminMeResponse {
  logged_in: boolean;
  login?: string;
}

export function adminLogin(
  login: string,
  password: string,
): Promise<AdminLoginResponse> {
  return request<AdminLoginResponse>("POST", "/api/admin/login", {
    login,
    password,
  });
}

export function adminLogout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("POST", "/api/admin/logout");
}

export function adminMe(): Promise<AdminMeResponse> {
  return request<AdminMeResponse>("GET", "/api/admin/me");
}

export interface AdminBookingsFilters {
  activity_id?: number;
  date_from?: string;
  date_to?: string;
}

export function listAdminBookings(
  filters: AdminBookingsFilters = {},
): Promise<AdminBookingRow[]> {
  const params = new URLSearchParams();
  if (filters.activity_id !== undefined) {
    params.set("activity_id", String(filters.activity_id));
  }
  if (filters.date_from !== undefined) {
    params.set("date_from", filters.date_from);
  }
  if (filters.date_to !== undefined) {
    params.set("date_to", filters.date_to);
  }
  const qs = params.toString();
  const url =
    qs.length > 0 ? `/api/admin/bookings?${qs}` : "/api/admin/bookings";
  return request<AdminBookingRow[]>("GET", url);
}

export function listAdminActivities(): Promise<Activity[]> {
  return request<Activity[]>("GET", "/api/admin/activities");
}

// Расписания админу нужны редко; возвращаем `unknown[]`, потому
// что UI их сейчас не показывает, и тащить тип `Schedule` сюда
// ради красоты — лишнее.
export function listAdminSchedules(activity_id?: number): Promise<unknown[]> {
  const url =
    activity_id !== undefined
      ? `/api/admin/schedules?activity_id=${activity_id}`
      : "/api/admin/schedules";
  return request<unknown[]>("GET", url);
}

export function cancelAdminBooking(booking_id: number): Promise<Booking> {
  return request<Booking>("POST", `/api/admin/bookings/${booking_id}/cancel`);
}
