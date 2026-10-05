// Тесты для чистых функций в server/src/slotEngine.ts.
// Эти тесты самые дешёвые: не нужна БД, не нужен Fastify, всё в памяти.

import { describe, expect, it } from "vitest";
import {
  buildSlots,
  formatMinutesToTime,
  parseTimeToMinutes,
  weekdaysFromJson,
  weekdaysToJson,
  type BusySlot,
} from "../../src/slotEngine.ts";
import type { Schedule } from "../../src/schemas.ts";

const makeSchedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  id: 1,
  activity_id: 1,
  weekdays: ["mon", "tue", "wed", "thu", "fri"],
  start_time: "10:00:00",
  end_time: "12:00:00",
  duration_minutes: 60,
  ...overrides,
});

describe("parseTimeToMinutes", () => {
  it("00:00:00 → 0", () => {
    expect(parseTimeToMinutes("00:00:00")).toBe(0);
  });
  it("10:30:00 → 630", () => {
    expect(parseTimeToMinutes("10:30:00")).toBe(630);
  });
  it("23:59:00 → 1439", () => {
    expect(parseTimeToMinutes("23:59:00")).toBe(1439);
  });
  it("бросает Error на неправильном формате", () => {
    expect(() => parseTimeToMinutes("10:30")).toThrow();
    expect(() => parseTimeToMinutes("")).toThrow();
    expect(() => parseTimeToMinutes("abc")).toThrow();
  });
});

describe("formatMinutesToTime", () => {
  it("обратна parseTimeToMinutes", () => {
    for (const t of ["00:00:00", "09:05:00", "12:00:00", "23:59:00"]) {
      expect(formatMinutesToTime(parseTimeToMinutes(t))).toBe(t);
    }
  });
  it("форматирует 0 как 00:00:00", () => {
    expect(formatMinutesToTime(0)).toBe("00:00:00");
  });
});

describe("weekdaysToJson / weekdaysFromJson", () => {
  it("round-trip для массива", () => {
    const arr = ["mon", "wed", "fri"];
    expect(weekdaysFromJson(weekdaysToJson(arr))).toEqual(arr);
  });
  it("бросает, если в БД не массив", () => {
    expect(() => weekdaysFromJson('"mon"')).toThrow();
    expect(() => weekdaysFromJson("null")).toThrow();
    expect(() => weekdaysFromJson("42")).toThrow();
  });
});

describe("buildSlots", () => {
  it("генерирует слоты по будням с 10:00 до 12:00, шаг 60 минут", () => {
    // 5 будних дней (07.10.2026 — среда), 2 слота в день = 10.
    const slots = buildSlots(makeSchedule(), [], "2026-10-05", "2026-10-11");
    expect(slots).toHaveLength(10);
    expect(slots[0]).toEqual({
      activity_id: 1,
      date: "2026-10-05",
      start_time: "10:00:00",
      duration_minutes: 60,
    });
  });

  it("учитывает длительность слота", () => {
    // Окно 18:00–20:00, шаг 30 минут = 4 слота в среду.
    const slots = buildSlots(
      makeSchedule({
        weekdays: ["wed"],
        start_time: "18:00:00",
        end_time: "20:00:00",
        duration_minutes: 30,
      }),
      [],
      "2026-10-05",
      "2026-10-11",
    );
    expect(slots.map((s) => s.start_time)).toEqual([
      "18:00:00",
      "18:30:00",
      "19:00:00",
      "19:30:00",
    ]);
  });

  it("не генерирует слот, если день недели не входит в расписание", () => {
    // Только среда — воскресенье пропускаем.
    const slots = buildSlots(
      makeSchedule({ weekdays: ["wed"] }),
      [],
      "2026-10-04", // воскресенье
      "2026-10-04",
    );
    expect(slots).toEqual([]);
  });

  it("исключает занятые слоты", () => {
    const busy: BusySlot[] = [
      { activity_id: 1, date: "2026-10-07", start_time: "10:00:00" },
    ];
    const slots = buildSlots(makeSchedule(), busy, "2026-10-07", "2026-10-07");
    // В среду должно было быть 2 слота, один занят — остаётся 1.
    expect(slots).toHaveLength(1);
    expect(slots[0]?.start_time).toBe("11:00:00");
  });

  it("не учитывает busy из другой активности", () => {
    const busy: BusySlot[] = [
      { activity_id: 999, date: "2026-10-07", start_time: "10:00:00" },
    ];
    const slots = buildSlots(makeSchedule(), busy, "2026-10-07", "2026-10-07");
    expect(slots).toHaveLength(2);
  });

  it("возвращает пустой массив, если окно меньше длительности", () => {
    const slots = buildSlots(
      makeSchedule({
        start_time: "10:00:00",
        end_time: "10:30:00",
        duration_minutes: 60,
      }),
      [],
      "2026-10-07",
      "2026-10-07",
    );
    expect(slots).toEqual([]);
  });

  it("возвращает пустой массив, если end_time <= start_time", () => {
    const slots = buildSlots(
      makeSchedule({
        start_time: "12:00:00",
        end_time: "10:00:00",
      }),
      [],
      "2026-10-07",
      "2026-10-07",
    );
    expect(slots).toEqual([]);
  });
});
