#!/usr/bin/env node
// Запрещает попадание в коммит служебных файлов, даже если разработчик
// использовал `git add -f` или `git add *`. Соответствует разделу
// "Чего делать нельзя" в AGENTS.md.
//
// Список расширений и путей синхронизирован с .gitignore, но это не
// подстраховка от плохого .gitignore, а явный стоп-кран в хуке.

import { execSync } from 'node:child_process';

const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
  .split('\n')
  .map((s) => s)
  .filter(Boolean);

const forbidden = [
  // SQLite и её журналы.
  { pattern: /^.*\.db(\*)?$/, label: 'файл базы данных SQLite' },
  { pattern: /^.*\.db-wal$/, label: 'журнал SQLite WAL' },
  { pattern: /^.*\.db-shm$/, label: 'журнал SQLite SHM' },
  // Сборка и зависимости.
  { pattern: /^node_modules\//, label: 'каталог зависимостей node_modules' },
  { pattern: /^.*\/dist\//, label: 'каталог сборки dist' },
  // Отчёты Playwright.
  { pattern: /^e2e\/test-results\//, label: 'отчёт тестов Playwright' },
  { pattern: /^e2e\/playwright-report\//, label: 'HTML-отчёт Playwright' },
  // Секреты и локальные настройки.
  { pattern: /^\.env(\.|$)/, label: 'файл переменных окружения .env' },
];

const offenders = [];
for (const file of staged) {
  for (const rule of forbidden) {
    if (rule.pattern.test(file)) {
      offenders.push({ file, label: rule.label });
      break;
    }
  }
}

if (offenders.length > 0) {
  console.error('✗ forbid-staged: в коммит пытаются попасть запрещённые файлы:');
  for (const o of offenders) {
    console.error(`  - ${o.file}  (${o.label})`);
  }
  console.error(
    'Удалите их из индекса: git rm --cached <файл>. Если очень надо — git commit --no-verify.',
  );
  process.exit(1);
}
