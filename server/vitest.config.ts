// Конфигурация vitest для server/. Тесты лежат в tests/, исходники в src/,
// OpenAPI — на уровень выше (../../contract/openapi.yaml).
//
// vitest автоматически резолвит `.ts` через esbuild, поэтому
// импорты в тестах могут идти прямо на `../../src/...`.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
