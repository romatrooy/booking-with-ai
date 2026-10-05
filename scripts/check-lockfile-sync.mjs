#!/usr/bin/env node
// Если в индексе изменился любой package.json, требует чтобы package-lock.json
// тоже был обновлён. Это защита от классической ошибки, когда разработчик
// добавил зависимость, закоммитил package.json, а lock-файл забыл.
//
// Проверка работает через `npm install --package-lock-only`, который
// пересчитывает lock-файл без записи в node_modules. Если после пересчёта
// в lock-файле появляются изменения, значит, он был не синхронен.

import { execSync } from 'node:child_process';

const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
if (!staged) process.exit(0);

const packageChanged = staged.split('\n').some((f) => /(^|\/)package\.json$/.test(f));

if (!packageChanged) process.exit(0);

console.log('  • package.json изменился, пересчитываю package-lock.json...');
execSync('npm install --package-lock-only --ignore-scripts', { stdio: 'inherit' });

const diff = execSync('git diff --name-only package-lock.json', { encoding: 'utf8' }).trim();
if (diff) {
  console.error('✗ package.json изменился, но package-lock.json не синхронизирован.');
  console.error('  Запустите: npm install');
  console.error('  Затем: git add package-lock.json');
  process.exit(1);
}
