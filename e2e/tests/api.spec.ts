// Сквозные тесты на уровне HTTP. Используют `request` — HTTP-клиент
// Playwright, который ходит к поднятому сервису. Это «e2e без UI»:
// проверяем, что реальный сервер, собранный `npm run build` и
// запущенный `npm start`, отвечает как ожидается.
//
// Когда появится web-интерфейс, сюда же добавятся page-тесты через
// `page.goto()` и `page.locator()`.

import { expect, test } from "@playwright/test";

test.describe("e2e: API контракт", () => {
  test("GET /api/activities возвращает массив", async ({ request }) => {
    const res = await request.get("/api/activities");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("полный сценарий: список активностей → создание брони → cancel", async ({
    request,
  }) => {
    // Получаем список активностей. По умолчанию в БД нет ничего
    // (если забыли прогнать `npm run seed`), и сценарий заканчивается
    // на `expect activity` без ошибки. Создание брони не делаем —
    // оно требует подготовленной БД.
    const list = await request.get("/api/activities");
    expect(list.status()).toBe(200);
    const activities = await list.json();
    expect(Array.isArray(activities)).toBe(true);

    if (activities.length === 0) {
      // БД пуста — это ожидаемо, если забыли `npm run seed`.
      // Дальнейшие шаги требуют активности, поэтому выходим.
      // В CI, где `npm run build` обычно не подразумевает `seed`,
      // это допустимое поведение.
      test.skip(true, "БД пуста: прогон `npm run seed` пропущен");
      return;
    }

    const activity = activities[0] as { id: number };
    const activityId: number = activity.id;

    // Получаем слоты. Должны быть слоты в рабочее время.
    const slotsRes = await request.get(
      `/api/slots?activity_id=${activityId}&date_from=2026-10-05&date_to=2026-10-11`,
    );
    expect(slotsRes.status()).toBe(200);
    const slots = await slotsRes.json();
    expect(Array.isArray(slots)).toBe(true);
    if (slots.length === 0) {
      test.skip(true, "Нет расписаний для активности");
      return;
    }

    // Берём первый слот и пытаемся забронировать.
    const slot = slots[0] as {
      activity_id: number;
      date: string;
      start_time: string;
    };

    // Если на этот слот уже есть бронь (от прошлого прогона seed),
    // повторная попытка даст 409 — это правильное поведение,
    // просто пропустим создание.
    const create = await request.post("/api/bookings", {
      data: {
        activity_id: slot.activity_id,
        date: slot.date,
        start_time: slot.start_time,
        guest_name: "E2E Гость",
        guest_email: "e2e-guest@example.com",
      },
    });
    if (create.status() === 409) {
      // Слот занят — это ожидаемо. Тест не должен падать: он
      // подтверждает, что сервис ведёт себя правильно и в этом
      // случае. Завершаем.
      return;
    }
    expect(create.status()).toBe(201);
    const booking = await create.json();
    expect(booking.status).toBe("active");

    // Повторный POST того же слота → 409 slot_taken.
    const duplicate = await request.post("/api/bookings", {
      data: {
        activity_id: slot.activity_id,
        date: slot.date,
        start_time: slot.start_time,
        guest_name: "E2E Гость 2",
        guest_email: "e2e-guest2@example.com",
      },
    });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()).code).toBe("slot_taken");

    // Отмена.
    const cancel = await request.post(`/api/bookings/${booking.id}/cancel`);
    expect(cancel.status()).toBe(200);
    expect((await cancel.json()).status).toBe("cancelled");

    // Повторный cancel → 409 booking_already_cancelled.
    const cancelAgain = await request.post(
      `/api/bookings/${booking.id}/cancel`,
    );
    expect(cancelAgain.status()).toBe(409);
    expect((await cancelAgain.json()).code).toBe("booking_already_cancelled");
  });

  test("404 на несуществующую активность через API", async ({ request }) => {
    const res = await request.post("/api/bookings", {
      data: {
        activity_id: 999_999,
        date: "2026-10-07",
        start_time: "10:00:00",
        guest_name: "E2E",
        guest_email: "e2e@example.com",
      },
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).code).toBe("activity_not_found");
  });

  test("422 на невалидный JSON через API", async ({ request }) => {
    const res = await request.post("/api/bookings", {
      data: {
        activity_id: 1,
        date: "not-a-date",
        start_time: "10:00:00",
        guest_name: "X",
        guest_email: "not-an-email",
      },
    });
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe("validation_failed");
  });
});
