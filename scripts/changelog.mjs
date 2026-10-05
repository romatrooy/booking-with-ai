#!/usr/bin/env node
// Генерирует CHANGELOG и выводит в stdout.
//
// Используется в release-конвейере GitHub Actions (.github/workflows/release.yml),
// где `softprops/action-gh-release` забирает вывод через `body_path` или
// перенаправление `> CHANGELOG.md`.
//
// Отличается от check-changelog.mjs тем, что:
//   - не читает и не пишет CHANGELOG.md;
//   - не вызывает `git add`;
//   - завершается с exit-кодом 1 при ошибке библиотеки.
//
// Выход: блок release-notes для последнего релиза.

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const ROOT = sh('git rev-parse --show-toplevel');
if (!ROOT) {
  console.error('changelog: не git-репозиторий');
  process.exit(1);
}

process.chdir(ROOT);

const lastTag = sh('git describe --tags --abbrev=0');
const fromArg = lastTag || null;

let conventionalChangelog;
let writerOpts;
try {
  conventionalChangelog = require('conventional-changelog');
  const config = require(join(ROOT, '.changelog-config.cjs'));
  writerOpts = config.writerOpts || {};
} catch (err) {
  console.error('changelog: библиотеки conventional-changelog не найдены.');
  console.error('  Установите: npm install --save-dev conventional-changelog conventional-changelog-angular');
  console.error(`  Причина: ${err.message}`);
  process.exit(1);
}

const stream = conventionalChangelog(
  {
    preset: 'angular',
    from: fromArg,
  },
  {},
  null,
  null,
  writerOpts,
);

let generated = '';
stream.on('data', (chunk) => {
  generated += chunk.toString();
});
stream.on('error', (err) => {
  console.error('changelog: ошибка генерации:', err.message);
  process.exit(1);
});

stream.on('end', () => {
  const HEADER = [
    '# Журнал изменений',
    '',
    'Все важные изменения в проекте документируются здесь.',
    'Формат записи — [Conventional Commits](https://www.conventionalcommits.org/ru/).',
    '',
  ].join('\n');

  process.stdout.write(HEADER + '\n' + generated);
});