# Синтаксис: декларативный Dockerfile (BuildKit не обязателен,
# но рекомендуется современной версией Docker). Сборка многоступенчатая:
# 1) deps   — ставит зависимости всех воркспейсов одной командой `npm ci`
#             в корне. Кэшируется отдельно, пересобирается только при
#             изменении package-lock.json.
# 2) build  — собирает TypeSpec-контракт, сервер (tsc) и фронт (vite).
#             Кэшируется отдельно, пересобирается при изменении исходников.
# 3) runtime — минимальный образ: только прод-зависимости, артефакты
#              сборки и код для запуска. Здесь нет devDependencies,
#              нет исходников, нет тестов.

# ─── 1. Зависимости ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 это модуль на C++. Обычно он ставит готовую сборку под нужную
# систему, и компилятор не требуется. Инструменты сборки стоят здесь на случай,
# если готовой сборки не нашлось: на размер итогового образа они не влияют,
# потому что остаются на первом этапе.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Копируем манифесты и ставим зависимости. Копируем все package.json
# сразу, чтобы установка не зависела от того, в каком порядке Docker
# увидит изменения в исходниках. `npm ci` требует package-lock.json
# строго в синхроне с package.json — это поведение нам подходит.
COPY package.json package-lock.json ./
COPY contract/package.json ./contract/package.json
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
COPY e2e/package.json ./e2e/package.json

# `npm ci` без `--ignore-scripts`: postinstall-скрипты нужны `esbuild`
# и `better-sqlite3` (нативные бинарники). `prepare`-хук ставит
# git-хуки, для этого нужен `scripts/install-hooks.mjs`, копируем
# его заранее.
COPY scripts/install-hooks.mjs ./scripts/install-hooks.mjs
RUN npm ci --include=optional

# ─── 2. Сборка ───────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /app

# Копируем исходники. К этому моменту node_modules уже есть, npm
# их не тронет: `COPY` адресует только нужные пути.
COPY contract ./contract
COPY server ./server
COPY web ./web
# Скрипт пересборки контракта внутри CI нам не нужен, но `contract:build`
# обращается только к contract/, ничего лишнего.
RUN npm run contract:build \
    && npm run build --workspace=server \
    && npm run build --workspace=web

# ─── 3. Финальный образ ──────────────────────────────────────────────────────
# Используем тот же базовый слой, что и в deps: это сохраняет кэш и
# гарантирует совместимость ABI у `better-sqlite3`.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Образ должен работать не от root. Создаём отдельного пользователя
# и группу, передаём ему каталог приложения. UID/GID фиксированные,
# чтобы владелец файлов в томе не «прыгал» между запусками.
RUN groupadd --system --gid 1001 booking \
    && useradd --system --uid 1001 --gid booking --home /app booking

# Копируем только то, что нужно рантайму: прод-зависимости и артефакты
# сборки. Исходники и dev-зависимости остаются в слое `build` и сюда
# не попадают.
COPY --from=build --chown=booking:booking /app/node_modules ./node_modules
COPY --from=build --chown=booking:booking /app/package.json ./package.json
COPY --from=build --chown=booking:booking /app/package-lock.json ./package-lock.json
COPY --from=build --chown=booking:booking /app/server/node_modules ./server/node_modules
COPY --from=build --chown=booking:booking /app/server/dist ./server/dist
COPY --from=build --chown=booking:booking /app/server/package.json ./server/package.json
COPY --from=build --chown=booking:booking /app/web/dist ./web/dist
COPY --from=build --chown=booking:booking /app/contract/openapi.yaml ./contract/openapi.yaml

# Каталог для файла базы. В compose сюда монтируется именованный том
# `booking-data`, и тогда `/data/booking.db` сохраняется между
# перезапусками. Создаём каталог заранее и отдаём пользователю
# `booking`, чтобы сервер мог туда писать.
RUN mkdir -p /data && chown -R booking:booking /data
USER booking
ENV NODE_ENV=production
# Порт и путь к базе задаются compose-файлом через переменные
# окружения. Здесь только значения по умолчанию, чтобы контейнер
# можно было запустить и без compose.
ENV BOOKING_PORT=8000
ENV BOOKING_HOST=0.0.0.0
ENV BOOKING_DB_FILE=/data/booking.db
ENV BOOKING_WEB_DIR=/app/web/dist
EXPOSE 8000

# Проверка здоровья: сервис отвечает на /api/activities (там не
# требуется ни авторизация, ни параметры). Интервал 10 секунд,
# таймаут 3 секунды, три неудачи подряд — unhealthy.
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.BOOKING_PORT+'/api/activities').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Запуск: сначала seed (он идемпотентен — дропает и пересоздаёт
# таблицы), затем сам сервис. Если в БД уже есть пользовательские
# брони, рестарт контейнера их сбросит; для сохранения броней
# между рестартами отредактируйте команду (см. README).
CMD ["sh", "-c", "node server/dist/seed.js && node server/dist/index.js"]
