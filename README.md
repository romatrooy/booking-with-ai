# Сервис бронирования тайм-слотов

Эталонный проект курса «ИИ для разработчиков» (Сибирский федеральный
университет, Академия Softline).

Организатор заводит виды активности («Консультация», «Код-ревью») и расписания
к ним. Гость открывает страницу, видит сетку свободных слотов на неделю,
выбирает время и оставляет бронь. Занятый слот повторно забронировать нельзя.

Проект собран методом Design First: сначала контракт API на TypeSpec, потом
код, который этому контракту соответствует, потом тесты, которые это проверяют.

## Что внутри

| Часть                  | Технология                                                            |
| ---------------------- | --------------------------------------------------------------------- |
| Язык                   | TypeScript в строгом режиме, Node.js 22                               |
| Сервис                 | Fastify 5, проверка данных на Zod 4                                   |
| Хранение               | SQLite через better-sqlite3                                           |
| Контракт               | TypeSpec в `contract/main.tsp`, OpenAPI 3.1 в `contract/openapi.yaml` |
| Интерфейс              | Vite, React 19, собственный CSS без библиотек компонентов             |
| Тесты                  | Vitest, 65 тестов; Playwright, 2 сквозных сценария                    |
| Запуск                 | Docker и docker compose                                               |
| Непрерывная интеграция | GitHub Actions                                                        |

Репозиторий устроен как рабочие пространства npm: один `package-lock.json`
в корне и четыре пакета внутри (`contract`, `server`, `web`, `e2e`).
Одна команда `npm install` в корне ставит зависимости всех четырёх.

## Что нужно поставить заранее

Только Node.js версии 22.12 или новее. Проверить:

```powershell
node --version
```

Ничего компилировать не придётся: `better-sqlite3` поставляется с готовыми
сборками для Windows, macOS и Linux.

## Запуск на Windows (PowerShell)

Выполняйте команды по одной, из папки с проектом.

```powershell
npm install
```

```powershell
npm run seed
```

Дальше нужны два окна PowerShell. В первом запускается сервис:

```powershell
npm run dev:server
```

Во втором окне, из той же папки, запускается интерфейс:

```powershell
npm run dev:web
```

Откройте http://localhost:5173

Остановить любую из команд: сочетание клавиш Ctrl+C в её окне.

Если PowerShell отказывается выполнять `npm.ps1`, разрешите это для текущего
окна и повторите команду:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## Запуск на macOS

```bash
npm install
```

```bash
npm run seed
```

Первое окно терминала:

```bash
npm run dev:server
```

Второе окно терминала:

```bash
npm run dev:web
```

Откройте http://localhost:5173

Остановить: сочетание клавиш Control+C в соответствующем окне.

## Запуск в собранном виде, один порт

Команды одинаковы на Windows и на macOS. Так сервис работает в контейнере:
интерфейс собран заранее и отдаётся тем же сервером, что и API.

```bash
npm run build
```

```bash
npm start
```

Откройте http://localhost:8000

## Запуск в Docker

Нужен установленный Docker Desktop. Команды одинаковы на обеих системах.

```bash
docker compose up -d --build
```

Сервис поднимется на http://localhost:8000, база наполнится демонстрационными
данными автоматически. Флаг `-d` уводит контейнер в фон, терминал остаётся
свободным. Посмотреть журнал: `docker compose logs -f`, выход Ctrl+C.
Остановить:

```bash
docker compose down
```

Удалить вместе с сохранёнными бронями:

```bash
docker compose down -v
```

## Тесты

Проверка типов во всех трёх пакетах:

```bash
npm run typecheck
```

Модульные и интеграционные тесты:

```bash
npm test
```

Ожидаемый вывод:

```
 Test Files  6 passed (6)
      Tests  65 passed (65)
```

Сквозные тесты в браузере. Сначала нужен собранный проект, браузер ставится
один раз:

```bash
npm run build
```

```bash
npx playwright install chromium
```

```bash
npm run e2e
```

Playwright сам поднимет сервис на порту 8123 с отдельной базой и погасит его
после тестов.

## Контракт API

Источник истины это `contract/main.tsp`. Из него компилятор TypeSpec собирает
`contract/openapi.yaml` в формате OpenAPI 3.1.

Собранный `contract/openapi.yaml` лежит в репозитории намеренно: так контракт
можно прочитать и отдать другой команде, не запуская сборку. Руками его
не правят. Пересобрать после правки `main.tsp`:

```bash
npm run contract:build
```

Непрерывная интеграция пересобирает контракт и сравнивает результат
с закоммиченным файлом. Если забыть пересобрать, сборка упадёт.

Соответствие кода контракту проверяет `server/tests/contract.test.ts`.
Он читает `openapi.yaml` и требует от приложения трёх вещей: в нём ровно те
эндпоинты, что описаны в контракте; каждый настоящий ответ сервиса подходит
под схему из контракта; каждый объявленный в контракте ответ хотя бы раз
встретился в жизни.

## Git-хуки

В папке `hooks/` лежат `pre-commit` и `commit-msg`. Они подключаются
автоматически во время `npm install` через `prepare`-скрипт, повторная
настройка не нужна. Если вдруг отключились:

```bash
npm run hooks:install
```

`pre-commit` перед каждым коммитом проверяет, что:

- в индексе нет `*.db`, `node_modules/`, `dist/`, отчётов Playwright
  и `.env` (даже через `git add -f`);
- файлы прошли `prettier --check`;
- обновлён `CHANGELOG.md` (генерируется из истории Conventional Commits
  и автоматически добавляется в индекс);
- `package.json` и `package-lock.json` синхронизированы;
- если менялся `contract/main.tsp` — `contract/openapi.yaml` тоже
  пересобран компилятором TypeSpec;
- `tsc --noEmit` проходит в изменённых воркспейсах.

`commit-msg` требует сообщение в формате
[Conventional Commits](https://www.conventionalcommits.org/ru/).
Тип коммита (`feat`, `fix`, `docs`, …) определяет, в какой раздел
CHANGELOG попадает изменение:

- `feat` — Новое
- `fix`, `perf` — Исправления
- `docs` — Документация
- `chore`, `refactor`, `test`, `build`, `ci`, `style`, `revert` — в CHANGELOG не попадает

Примеры хороших сообщений:

```text
feat: добавить страницу «Мои брони»
fix(bookings): правильно отдавать 409 при двойном бронировании
docs: обновить README про запуск в Docker
chore: поднять версию better-sqlite3
```

Subject пишется со строчной буквы и без точки в конце. Чтобы срочно
обойти хук: `git commit --no-verify`. Делать это в обычной работе
не нужно.

## Эндпоинты

| Метод и путь                             | Что делает                              |
| ---------------------------------------- | --------------------------------------- |
| `GET /api/activities`                    | список видов активности                 |
| `POST /api/activities`                   | создать вид активности                  |
| `GET /api/schedules`                     | список расписаний, фильтр `activity_id` |
| `POST /api/schedules`                    | создать расписание                      |
| `GET /api/slots`                         | слоты активности на диапазон дат        |
| `GET /api/bookings`                      | список броней, фильтр `guest_email`     |
| `POST /api/bookings`                     | создать бронь                           |
| `POST /api/bookings/{booking_id}/cancel` | отменить бронь                          |

Пример запроса слотов (Windows PowerShell):

```powershell
curl.exe "http://127.0.0.1:8000/api/slots?activity_id=1&date_from=2026-10-05&date_to=2026-10-09"
```

То же самое на macOS:

```bash
curl "http://127.0.0.1:8000/api/slots?activity_id=1&date_from=2026-10-05&date_to=2026-10-09"
```

Пример создания брони на macOS:

```bash
curl -X POST http://127.0.0.1:8000/api/bookings -H "Content-Type: application/json" -d '{"activity_id":1,"date":"2026-10-05","start_time":"10:00:00","guest_name":"Иван Петров","guest_email":"ivan@example.com"}'
```

Повторный такой же запрос вернёт код 409 и тело:

```json
{ "code": "slot_taken", "message": "Этот слот уже забронирован" }
```

## Ошибки API

Тело ответа при любой ошибке одинаковое: машиночитаемый `code` и `message`
на русском языке для показа пользователю.

| Код состояния | `code`                      | Когда                                   |
| ------------- | --------------------------- | --------------------------------------- |
| 404           | `activity_not_found`        | нет такого вида активности              |
| 404           | `booking_not_found`         | нет такой брони                         |
| 409           | `slot_taken`                | на этот слот уже есть действующая бронь |
| 409           | `booking_already_cancelled` | бронь отменена раньше                   |
| 422           | `validation_failed`         | данные не прошли проверку               |
| 422           | `slot_not_found`            | в расписании нет слота с таким началом  |
| 422           | `invalid_time_window`       | начало рабочего окна не раньше конца    |
| 422           | `invalid_date_range`        | диапазон дат пустой или длиннее 60 дней |

## Переменные окружения

| Переменная        | По умолчанию         | Смысл                         |
| ----------------- | -------------------- | ----------------------------- |
| `BOOKING_PORT`    | `8000`               | порт сервиса                  |
| `BOOKING_HOST`    | `0.0.0.0`            | адрес, который слушает сервис |
| `BOOKING_DB_FILE` | `booking.db` в корне | файл базы данных              |
| `BOOKING_WEB_DIR` | `web/dist`           | папка с собранным интерфейсом |

## Документация

Проектные решения собраны в каталоге `docs/`:

- `docs/pdr/0001-bronirovanie-taym-slotov.md` — что делает сервис и почему
  он такой (продуктовое решение).
- `docs/adr/0001-vybor-sqlite.md` — почему SQLite, а не другая СУБД.
- `docs/adr/0002-generatsiya-slotov-na-letu.md` — почему слоты считаются,
  а не хранятся.
- `docs/adr/0003-zashchita-ot-dvoynogo-bronirovaniya.md` — как защищаемся
  от двойного бронирования.
- `docs/ontology.md` — сущности предметной области и инварианты.

Файл `AGENTS.md` в корне — памятка для ИИ-агента, работающего с репозиторием.

## Структура репозитория

```
AGENTS.md                     файл памяти для ИИ-агента
README.md                     этот файл
docs/                         проектная документация (PDR, ADR, онтология)
package.json                  рабочие пространства npm и общие команды
Dockerfile                    образ сервиса
docker-compose.yml            запуск одной командой
contract/main.tsp             контракт API на TypeSpec
contract/openapi.yaml         собранный контракт OpenAPI 3.1
server/src/                   код сервиса
server/tests/                 тесты Vitest
web/src/                      интерфейс на React
e2e/                          сквозные тесты Playwright
docs/adr/                     архитектурные решения
docs/pdr/                     продуктовое решение
docs/ontology.md              доменная модель
.github/workflows/ci.yml      проверка кода в GitHub Actions
.github/workflows/publish-image.yml   сборка и публикация Docker-образа
```

## Готовый образ из GitHub Container Registry

Каждый коммит в `main` автоматически собирается и публикуется в
[GitHub Container Registry](https://github.com/romatrooy/ait_repo2/pkgs/container/ait_repo2).
Теги: `latest` (последний коммит в `main`) и короткий SHA коммита.

Запуск без сборки — одна команда:

```bash
docker run --rm -p 8000:8000 --name booking ghcr.io/romatrooy/ait_repo2:latest
```

На Windows / Mac контейнер должен быть на той же архитектуре, что и хост.
Образ публикуется сразу под две платформы (`linux/amd64` и `linux/arm64`),
поэтому Docker сам выберет подходящую. Если контейнер не запускается на
Apple Silicon — явно укажите архитектуру:

```bash
docker run --rm --platform=linux/amd64 -p 8000:8000 ghcr.io/romatrooy/ait_repo2:latest
```

С томом для базы данных (брони не пропадут между перезапусками):

```bash
docker volume create booking-data
docker run --rm -d --name booking -p 8000:8000 \
  -v booking-data:/data \
  ghcr.io/romatrooy/ait_repo2:latest
```

Через `docker compose` — `docker-compose.yml` придётся подправить, чтобы
вместо `build:` использовать `image:`:

```yaml
services:
  booking:
    image: ghcr.io/romatrooy/ait_repo2:latest # вместо build: .
    ports:
      - "8000:8000"
    volumes:
      - booking-data:/data
    command: sh -c "node server/dist/seed.js && node server/dist/index.js"
    restart: unless-stopped

volumes:
  booking-data:
```

Конкретная версия (например, для отладки):

```bash
docker pull ghcr.io/romatrooy/ait_repo2:6ce609a
docker run --rm -p 8000:8000 ghcr.io/romatrooy/ait_repo2:6ce609a
```

## Если что-то не завелось

| Признак                                             | Что делать                                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm` не найден                                     | поставьте Node.js 22 с nodejs.org и откройте новое окно терминала                                                             |
| PowerShell не даёт запустить `npm`                  | выполните `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`                                                        |
| Порт 8000 занят                                     | запустите с другим портом: `npm start` после `$env:BOOKING_PORT=8001` в PowerShell или `BOOKING_PORT=8001 npm start` на macOS |
| Порт 5173 занят                                     | Vite сам предложит следующий свободный порт                                                                                   |
| В интерфейсе «Активностей пока нет»                 | выполните `npm run seed` и обновите страницу                                                                                  |
| Слотов нет ни в один день                           | у активности нет расписания, создайте его запросом `POST /api/schedules`                                                      |
| Хочется начать с чистой базы                        | удалите файл `booking.db` и снова выполните `npm run seed`                                                                    |
| `npm run e2e` жалуется, что не найден `server/dist` | сначала выполните `npm run build`                                                                                             |
| Playwright просит браузер                           | выполните `npx playwright install chromium`                                                                                   |

некоторые изменения
