#!/usr/bin/env node
// pre-commit-хук. Запускает по порядку проверки из scripts/.
// Подключается через `npm run hooks:install` или из скрипта prepare при
// `npm install` (см. scripts/install-hooks.mjs).
//
// Каждый скрипт идемпотентен: сам решает, делать ли работу. Если в индексе
// нет подходящих файлов, скрипт выходит с кодом 0 без действий.
//
// Порядок:
//   1. forbid-staged       — запрет файлов в индексе (.db, .env и т.п.)
//   2. prettier-staged     — prettier --check по staged
//   3. check-lockfile-sync — синхронность package.json / package-lock.json
//   4. check-contract-sync — синхронность contract/main.tsp / openapi.yaml
//   5. check-changelog     — пересборка CHANGELOG.md по истории
//   6. typecheck-staged    — tsc --noEmit в затронутых воркспейсах
//
// Любая ошибка прерывает коммит. Чтобы срочно обойти:
// `git commit --no-verify`. Делать это в обычной работе не нужно.
//
// Этот файл — CommonJS. ESM (import/export) не работает, потому что
// Git выполняет .js-файлы хука как `node ./pre-commit` — и при
// `import.meta.url` падает с «Cannot use import.meta outside a module».
// В CommonJS `__dirname` доступен сразу.

"use strict";
const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");

// `__dirname` указывает на каталог, где лежит этот скрипт (hooks/).
// Поднимаемся на уровень вверх к корню репозитория.
const repoRoot = resolve(__dirname, "..");
const scriptsDir = resolve(repoRoot, "scripts");

const checks = [
  "forbid-staged.mjs",
  "prettier-staged.mjs",
  "check-lockfile-sync.mjs",
  "check-contract-sync.mjs",
  "check-changelog.mjs",
  "typecheck-staged.mjs",
];

for (const name of checks) {
  const script = resolve(scriptsDir, name);
  try {
    execFileSync("node", [script], { cwd: repoRoot, stdio: "inherit" });
  } catch (error) {
    // Скрипт сам печатает понятное сообщение об ошибке.
    // Здесь только добавим подсказку, как обойти.
    console.error(`✗ pre-commit: ${name} прервал коммит`);
    console.error("  Чтобы срочно обойти: git commit --no-verify");
    process.exit(error.status || 1);
  }
}

console.log("✓ pre-commit: все проверки пройдены");
