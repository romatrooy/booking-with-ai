#!/usr/bin/env node
// commit-msg-хук. Требует сообщение в формате Conventional Commits
// (https://www.conventionalcommits.org/ru/).
//
// Формат:
//   type(scope)!: subject
//   type: subject
//
// subject — со строчной буквы, без точки в конце.
// scope — в круглых скобках, опционально.
// ! — маркер breaking change (необязательно).
//
// Допустимые типы и их попадание в CHANGELOG (соответствует README):
//   feat             — Новое
//   fix, perf        — Исправления
//   docs             — Документация
//   chore, refactor, test, build, ci, style, revert — в CHANGELOG не попадают

import { readFileSync } from "node:fs";

const allowedTypes = [
  "feat",
  "fix",
  "perf",
  "docs",
  "chore",
  "refactor",
  "test",
  "build",
  "ci",
  "style",
  "revert",
];

const subjectFile = process.argv[2];
if (!subjectFile) {
  console.error("✗ commit-msg: не передан путь к файлу сообщения");
  process.exit(1);
}

let subject;
try {
  subject = readFileSync(subjectFile, "utf8").split("\n")[0];
} catch (error) {
  console.error(
    `✗ commit-msg: не удалось прочитать ${subjectFile}: ${error.message}`,
  );
  process.exit(1);
}

// Шаблон Conventional Commits
const pattern =
  /^(feat|fix|perf|docs|chore|refactor|test|build|ci|style|revert)(\([a-z0-9_-]+\))?(!)?: (.*)$/;
const match = subject.match(pattern);
if (!match) {
  console.error("✗ Сообщение коммита не в формате Conventional Commits.");
  console.error(`  Текущее: ${subject}`);
  console.error("  Ожидалось: type(scope)?!: subject");
  console.error(`  Допустимые типы: ${allowedTypes.join(", ")}.`);
  console.error("  Пример: 'feat: добавить страницу «Мои брони»'");
  console.error(
    "  Пример: 'fix(bookings): правильно отдавать 409 при двойном бронировании'",
  );
  process.exit(1);
}

const [, , , , body] = match;
const firstChar = body.charAt(0);
if (firstChar >= "A" && firstChar <= "Z") {
  console.error("✗ subject должен начинаться со строчной буквы.");
  console.error(`  Текущий: ${body}`);
  process.exit(1);
}

const lastChar = body.charAt(body.length - 1);
if (lastChar === ".") {
  console.error("✗ subject не должен заканчиваться точкой.");
  console.error(`  Текущий: ${body}`);
  process.exit(1);
}

process.exit(0);
