// Чистые функции админки: подпись cookie, проверка, брутфорс-лимит.
// Тесты не требуют БД и Fastify.

import { afterEach, describe, expect, it } from "vitest";
import {
  buildAdminCredentials,
  checkPassword,
  clearAllLoginAttempts,
  consumeLoginAttempt,
  LOGIN_LIMIT,
  registerLoginFailure,
  resetLoginAttempts,
  signSession,
  verifySession,
} from "../../src/adminAuth.js";

const SECRET = "test-secret-do-not-use-in-prod";

describe("signSession / verifySession", () => {
  it("округляет подпись и принимает её обратно", () => {
    const now = 1_700_000_000_000;
    const cookie = signSession(SECRET, "admin", now);
    const session = verifySession(SECRET, cookie, now + 1000);
    expect(session).not.toBeNull();
    expect(session?.login).toBe("admin");
  });

  it("отвергает подделанную подпись", () => {
    const cookie = signSession(SECRET, "admin", Date.now());
    // Меняем последний символ подписи.
    const tampered = cookie.slice(0, -1) + (cookie.endsWith("0") ? "1" : "0");
    expect(verifySession(SECRET, tampered)).toBeNull();
  });

  it("отвергает истёкшую сессию", () => {
    const now = 1_700_000_000_000;
    const cookie = signSession(SECRET, "admin", now);
    // Через 9 часов — точно истекла.
    expect(verifySession(SECRET, cookie, now + 9 * 60 * 60 * 1000)).toBeNull();
  });

  it("отвергает неверный формат", () => {
    expect(verifySession(SECRET, "")).toBeNull();
    expect(verifySession(SECRET, "no-dots")).toBeNull();
    // Длина подписи не совпадает с ожидаемой (64 hex-символа) —
    // отвергаем. Проверяем, что мусор не принимается за валидную сессию.
    expect(verifySession(SECRET, "a.b.c")).toBeNull();
    expect(verifySession(SECRET, "a..c")).toBeNull();
    // Нечисловой expiry тоже отвергаем.
    expect(verifySession(SECRET, "admin.not-a-number.sig")).toBeNull();
  });

  it("отвергает при другом секрете", () => {
    const cookie = signSession(SECRET, "admin", Date.now());
    expect(verifySession("other-secret", cookie)).toBeNull();
  });
});

describe("checkPassword", () => {
  it("принимает верный пароль и отвергает неверный", () => {
    const creds = buildAdminCredentials("admin", "Pas!_123");
    expect(creds.verify("Pas!_123")).toBe(true);
    expect(creds.verify("Pas!_124")).toBe(false);
    expect(creds.verify("")).toBe(false);
  });
});

describe("brute-force guard", () => {
  afterEach(() => {
    clearAllLoginAttempts();
  });

  it("первая проверка возвращает полный лимит, не считая", () => {
    const ip = "10.0.0.1";
    const now = 1_700_000_000_000;
    // `consumeLoginAttempt` только проверяет лимит, не инкрементирует.
    // Поэтому при пустом счётчике возвращает `LOGIN_LIMIT` каждый раз.
    expect(consumeLoginAttempt(ip, now)).toBe(LOGIN_LIMIT);
    expect(consumeLoginAttempt(ip, now)).toBe(LOGIN_LIMIT);
  });

  it("после LOGIN_LIMIT неудач бросает ApiError", () => {
    const ip = "10.0.0.2";
    const now = 1_700_000_000_000;
    for (let i = 0; i < LOGIN_LIMIT; i += 1) {
      registerLoginFailure(ip, now);
    }
    expect(() => consumeLoginAttempt(ip, now)).toThrow();
  });

  it("registerLoginFailure не превышает лимит", () => {
    const ip = "10.0.0.3";
    const now = 1_700_000_000_000;
    expect(registerLoginFailure(ip, now)).toBe(LOGIN_LIMIT - 1);
    expect(registerLoginFailure(ip, now)).toBe(LOGIN_LIMIT - 2);
    // Дальше счётчик не уходит в минус.
    const last = registerLoginFailure(ip, now);
    expect(last).toBeGreaterThanOrEqual(0);
  });

  it("resetLoginAttempts обнуляет счётчик", () => {
    const ip = "10.0.0.4";
    const now = 1_700_000_000_000;
    registerLoginFailure(ip, now);
    registerLoginFailure(ip, now);
    resetLoginAttempts(ip);
    // После сброса счётчик пуст, лимит полный.
    expect(consumeLoginAttempt(ip, now)).toBe(LOGIN_LIMIT);
  });

  it("после окончания окна счётчик сбрасывается", () => {
    const ip = "10.0.0.5";
    const now = 1_700_000_000_000;
    registerLoginFailure(ip, now);
    registerLoginFailure(ip, now);
    // Через минуту + 1 мс — новое окно, счётчик пуст.
    const later = now + 60_000 + 1;
    expect(consumeLoginAttempt(ip, later)).toBe(LOGIN_LIMIT);
  });
});
