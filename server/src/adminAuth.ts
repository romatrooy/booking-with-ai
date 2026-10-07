// Аутентификация администратора. AGENTS.md §5:
// "server/src/adminAuth.ts — логин/пароль из env, проверка, подпись
// cookie, брутфорс-лимит".
//
// Решение зафиксировано в docs/adr/0004-admin-auth.md:
// - логин/пароль из env (дефолт `admin` / `Pas!_123`);
// - хеш пароля через `bcryptjs` (одна зависимость, чистый JS);
// - сессия в `httpOnly` cookie `admin_session` с подписью через
//   `node:crypto.createHmac('sha256', secret)`;
// - брутфорс-лимит: 5 неудачных попыток входа с одного IP в минуту.
//
// Здесь нет SQL и нет работы с Fastify — чистая логика, которую
// удобно тестировать в `server/tests/unit/adminAuth.test.ts`.

import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { ApiError } from "./errors.js";

export const SESSION_COOKIE = "admin_session";

// Срок жизни сессии — 8 часов (рабочий день). Хранится в cookie
// как `unix seconds`, проверяется при каждом запросе.
const SESSION_TTL_SECONDS = 8 * 60 * 60;

// Сколько неудачных попыток входа с одного IP разрешено в минуте.
const MAX_ATTEMPTS_PER_MINUTE = 5;

// Длина окна для счётчика попыток.
const ATTEMPT_WINDOW_MS = 60 * 1000;

// Лимит попыток нужен и в `adminAuth.test.ts`, и в самом
// `routes/admin.ts` — экспортируем как константу.
export const LOGIN_LIMIT = MAX_ATTEMPTS_PER_MINUTE;

// ─── Хеш пароля ───────────────────────────────────────────────────────────

// Считаем хеш пароля один раз при старте. `bcryptjs.hashSync` с
// `saltRounds = 10` — стандартный выбор для учебного проекта.
// Хранится в замыкании, наружу не уходит.
function buildHashedPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

// Сравнение введённого пароля с эталоном. Возвращает `boolean`,
// чтобы вызывающий код мог решить, как реагировать.
// `bcryptjs@2.x` — синхронный API, но `@types/bcryptjs@2.x`
// типизирует `compare` как `Promise<boolean>` (по образцу
// нативного `bcrypt`). Используем `compareSync` — он и в
// самой библиотеке, и в типах синхронный.
export function checkPassword(plain: string, hashedReference: string): boolean {
  try {
    return bcrypt.compareSync(plain, hashedReference);
  } catch {
    return false;
  }
}

// ─── Подпись cookie ────────────────────────────────────────────────────────

// Формат значения cookie: `<login>.<expiry>.<sig>`, где
//   sig = hex( hmacSha256(secret, `${login}|${expiry}`) ).
// Разделитель `.` удобен для парсинга, `|` внутри подписи — чтобы
// коллизия между логином и числом была невозможна.
function sign(secret: string, login: string, expiry: number): string {
  return createHmac("sha256", secret)
    .update(`${login}|${expiry}`)
    .digest("hex");
}

export interface Session {
  readonly login: string;
  readonly expiry: number;
}

// Собрать значение cookie. Возвращает строку для `Set-Cookie`.
export function signSession(
  secret: string,
  login: string,
  now: number = Date.now(),
): string {
  const expiry = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const sig = sign(secret, login, expiry);
  return `${login}.${expiry}.${sig}`;
}

// Проверить значение cookie. Возвращает `Session` при успехе или
// `null`, если подпись неверна, срок истёк или формат сломан.
export function verifySession(
  secret: string,
  value: string | undefined,
  now: number = Date.now(),
): Session | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [login, expiryRaw, sig] = parts as [string, string, string];
  if (login === undefined || expiryRaw === undefined || sig === undefined) {
    return null;
  }
  const expiry = Number.parseInt(expiryRaw, 10);
  if (Number.isNaN(expiry) || expiry <= 0) return null;
  if (expiry * 1000 <= now) return null;

  const expected = sign(secret, login, expiry);
  // Сравниваем через `timingSafeEqual`, чтобы не утекало время
  // сравнения. Длины должны совпадать (обе — 64 hex-символа), но
  // на всякий случай проверяем.
  if (expected.length !== sig.length) return null;
  try {
    const ok = timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(sig, "hex"),
    );
    if (!ok) return null;
  } catch {
    return null;
  }
  return { login, expiry };
}

// ─── Защита от брутфорса ───────────────────────────────────────────────────

interface AttemptState {
  attempts: number;
  resetAt: number;
}

// Состояние счётчика по IP. Хранится в памяти процесса: при
// перезапуске сбрасывается. Для учебного проекта это нормально.
const attempts = new Map<string, AttemptState>();

// Возвращает число оставшихся попыток для IP. Если лимит
// превышен — бросает `ApiError("unauthorized")`.
// `nowMs` передаётся для тестируемости.
//
// Семантика: функция только **проверяет** лимит, не увеличивая
// счётчик. Регистрация неудачной попытки — отдельная функция
// `registerLoginFailure`, которая вызывается уже после того, как
// стало ясно, что пароль неверный. Так пользователь видит
// `attempts_left: 4` именно после первой неудачи, а не после
// «бронирования» попытки впустую.
export function consumeLoginAttempt(
  ip: string,
  nowMs: number = Date.now(),
): number {
  const state = attempts.get(ip);
  if (state === undefined || state.resetAt <= nowMs) {
    // Окно истекло — счётчик пуст, все попытки доступны.
    return MAX_ATTEMPTS_PER_MINUTE;
  }
  if (state.attempts >= MAX_ATTEMPTS_PER_MINUTE) {
    throw new ApiError("unauthorized");
  }
  return MAX_ATTEMPTS_PER_MINUTE - state.attempts;
}

// Регистрация неудачной попытки входа. Возвращает новое значение
// `attempts_left` (после инкремента). Используется в обработчике
// `/api/admin/login` при неверном пароле.
export function registerLoginFailure(
  ip: string,
  nowMs: number = Date.now(),
): number {
  const state = attempts.get(ip);
  if (state === undefined || state.resetAt <= nowMs) {
    // Окно истекло — начинаем заново.
    attempts.set(ip, { attempts: 1, resetAt: nowMs + ATTEMPT_WINDOW_MS });
    return MAX_ATTEMPTS_PER_MINUTE - 1;
  }
  state.attempts += 1;
  return MAX_ATTEMPTS_PER_MINUTE - state.attempts;
}

// Сброс счётчика после успешного входа.
export function resetLoginAttempts(ip: string): void {
  attempts.delete(ip);
}

// Сброс всех счётчиков. Используется в тестах, чтобы состояние
// одного сценария не утекало в другой.
export function clearAllLoginAttempts(): void {
  attempts.clear();
}

// ─── Учётные данные администратора ────────────────────────────────────────

// Фабрика, которую `app.ts` вызывает один раз при старте. Хеш
// хранится в замыкании, и в обработчиках мы сравниваем пароль
// с ним через `verify`.
export interface AdminCredentials {
  readonly login: string;
  verify(plain: string): boolean;
}

export function buildAdminCredentials(
  login: string,
  plainPassword: string,
): AdminCredentials {
  const hashedPassword = buildHashedPassword(plainPassword);
  return {
    login,
    verify(plain: string): boolean {
      return checkPassword(plain, hashedPassword);
    },
  };
}
