#!/usr/bin/env node
// Устанавливает git-хуки из папки hooks/ в корне репозитория.
// Идемпотентен — можно запускать сколько угодно раз.
//
// Что делает:
//   1. Проверяет, что мы внутри git-репозитория.
//   2. Если core.hooksPath не указывает на нашу папку hooks/ — настраивает.
//   3. Делает файлы хуков исполняемыми (для Linux и macOS; на Windows
//      бит исполнения не нужен — Git берёт .cmd-обёртку напрямую).
//
// Запускается автоматически через npm-скрипт prepare после npm install.
//
// Структура hooks/:
//   pre-commit          — sh-обёртка (запускает pre-commit.cjs)
//   pre-commit.cjs      — основной скрипт (Node, CommonJS)
//   commit-msg          — sh-обёртка (запускает commit-msg.cjs)
//   commit-msg.cjs      — основной скрипт
//
// Файлы `pre-commit` и `commit-msg` (без расширения) — это и есть хуки,
// которые Git находит по имени события. Они реализованы как sh-скрипты:
// на Linux/macOS это системный /bin/sh, на Windows — sh.exe из поставки
// Git for Windows (C:\Program Files\Git\usr\bin\sh.exe). Git находит
// его автоматически при выполнении хука.
//
// Расширение `.cjs` важно: проект объявлен как ESM (`"type": "module"`),
// и без явного `.cjs` Node пытается интерпретировать скрипт как ESM,
// где `require` не определён.

import { execSync } from "node:child_process";
import { existsSync, chmodSync } from "node:fs";
import { join } from "node:path";

function runQuiet(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

// 1. Проверяем, что мы в git-репозитории.
const toplevel = runQuiet("git rev-parse --show-toplevel");
if (!toplevel) {
  console.warn("⚠ install-hooks: не git-репозиторий, хуки не настроены");
  process.exit(0);
}

// 2. Проверяем нашу папку hooks/.
const hooksDir = join(toplevel, "hooks");
if (!existsSync(hooksDir)) {
  console.warn(`⚠ install-hooks: папка ${hooksDir} не найдена`);
  process.exit(0);
}

// 3. Настраиваем core.hooksPath.
const currentPath = runQuiet("git config --get core.hooksPath");
const desiredPath = "hooks";

if (currentPath !== desiredPath) {
  execSync(`git config core.hooksPath ${desiredPath}`, { stdio: "inherit" });
  console.log(`✓ install-hooks: core.hooksPath → ${desiredPath}`);
} else {
  console.log(`✓ install-hooks: core.hooksPath уже указывает на ${desiredPath}`);
}

// 4. Делаем файлы хуков исполняемыми (Linux/macOS). На Windows
//    chmod не имеет эффекта, но и не нужен — Git for Windows сам
//    запустит sh-обёртку через свой sh.exe.
const hooks = ["pre-commit", "commit-msg", "pre-commit.cjs", "commit-msg.cjs"];
for (const hook of hooks) {
  const path = join(hooksDir, hook);
  if (!existsSync(path)) {
    console.warn(`⚠ install-hooks: ${hook} не существует, пропускаю`);
    continue;
  }
  try {
    chmodSync(path, 0o755);
    console.log(`✓ install-hooks: chmod +x ${hook}`);
  } catch (err) {
    console.log(`  install-hooks: chmod пропущен для ${hook} (${err.message})`);
  }
}