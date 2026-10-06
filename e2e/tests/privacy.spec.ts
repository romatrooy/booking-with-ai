// Сквозной UI-тест: проверяет, что пользовательский сценарий бронирования
// работает в реальном браузере, и что ссылка на политику конфиденциальности
// действительно открывает отдельную страницу.
//
// `webServer` в `playwright.config.ts` поднимает `npm start` перед
// прогоном. Тест переходит на главную, проходит весь сценарий до
// «Вы записаны», и отдельно проверяет, что страница `/privacy` доступна
// напрямую и с неё можно вернуться на главную.

import { expect, test } from "@playwright/test";

test.describe("e2e: пользовательский сценарий", () => {
  test("главная → выбор слота → запись → «Вы записаны» → политика", async ({
    page,
  }) => {
    // Главная должна загрузиться без ошибок. Сразу заходим на корень:
    // SPA-fallback в `server/src/app.ts` отдаёт `index.html` для
    // произвольных путей, а `App.tsx` читает `window.location.pathname`.
    // Используем полный URL: локальный Playwright иногда не резолвит
    // `baseURL` корректно, и относительный путь даёт
    // `Cannot navigate to invalid URL`.
    await page.goto("http://127.0.0.1:8000/");
    await expect(page).toHaveTitle("Запись на встречу");

    // Хотя бы одна активность уже выбрана. Ждём, пока радиокнопки
    // появятся, и кликаем по «Код-ревью»: в seed-данных у неё всего
    // один слот в день, и он не пересекается с другими тестами.
    const codeReview = page.getByRole("radio", { name: /Код-ревью/ });
    await expect(codeReview).toBeVisible();
    await codeReview.click();

    // Ждём, пока появятся слоты. Берём первый попавшийся — он будет
    // свободным, потому что до этого UI-теста никто не бронировал
    // через Playwright. Используем класс `slot-grid__button--free`,
    // потому что `getByRole().filter().first()` в Playwright
    // не учитывает порядок после `.filter` и кликает по первому
    // слоту DOM, который может быть занятым.
    const firstSlot = page.locator(".slot-grid__button--free").first();
    await expect(firstSlot).toBeVisible();
    await firstSlot.click();

    // Уникальный идентификатор для прогона, чтобы повторные запуски
    // теста не ловили 409 slot_taken. Используется в обоих местах,
    // где заполняется форма: до ухода на `/privacy` она ещё не
    // заполнена, а после возврата React размонтировал `BookForm` и
    // `useState` сбросился.
    const stamp = Date.now();

    // Форма бронирования открылась. Сразу проверяем, что ссылка
    // на политику есть, и кликаем по ней — это основной сценарий,
    // ради которого тест написан.
    const privacyLink = page.getByRole("button", {
      name: "политикой конфиденциальности",
    });
    await expect(privacyLink).toBeVisible();
    await privacyLink.click();

    // После клика — отдельная страница «Политика конфиденциальности».
    // URL должен смениться, заголовок страницы — тоже.
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { name: "Политика конфиденциальности" }),
    ).toBeVisible();
    // Проверяем, что в тексте присутствуют плейсхолдеры шаблона 152-ФЗ.
    await expect(page.getByText("[имя оператора]")).toBeVisible();
    await expect(page.getByText("[контактный e-mail]")).toBeVisible();

    // Возвращаемся к записи. Кнопка «← К записи» использует
    // `history.pushState`, поэтому проверяем и URL, и видимость формы.
    // Заполняем форму заново: пока мы были на экране политики,
    // React отмонтировал `BookForm`, и локальный `useState` полей
    // сбросился. Используем тот же `stamp`, чтобы данные совпадали
    // с уже введёнными (если бы они сохранились).
    await page.getByRole("button", { name: /К записи/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("textbox", { name: "Имя" }),
    ).toBeVisible();
    await page.getByRole("textbox", { name: "Имя" }).fill(`E2E ${stamp}`);
    await page
      .getByRole("textbox", { name: "Электронная почта" })
      .fill(`e2e-${stamp}@example.com`);

    // Отправляем форму. Кнопка «Записаться» должна быть активной.
    await expect(
      page.getByRole("button", { name: "Записаться" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Записаться" }).click();
    await expect(
      page.getByRole("heading", { name: "Вы записаны" }),
    ).toBeVisible();
  });

  test("прямой переход на /privacy показывает страницу политики", async ({
    page,
  }) => {
    await page.goto("http://127.0.0.1:8000/privacy");
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { name: "Политика конфиденциальности" }),
    ).toBeVisible();
  });

  test("ссылка в футере главной открывает политику", async ({ page }) => {
    await page.goto("http://127.0.0.1:8000/");
    await page
      .getByRole("button", { name: "Политика конфиденциальности" })
      .click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { name: "Политика конфиденциальности" }),
    ).toBeVisible();
  });
});