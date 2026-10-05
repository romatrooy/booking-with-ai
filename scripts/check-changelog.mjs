#!/usr/bin/env node
// Генерирует CHANGELOG.md перед коммитом и кладёт его в индекс.
//
// Логика:
//   1. Определить начало диапазона:
//      - если есть теги — от последнего тега;
//      - если тегов нет — undefined, тогда conventional-changelog возьмёт
//        все коммиты от корня и сгенерирует первый релиз.
//   2. Сгенерировать блок через conventional-changelog + angular-шаблон.
//      В нашем конфиге подменяется transform, который сохраняет feat/fix/docs
//      и подменяет их на русские названия групп (Новое / Исправления / Документация).
//   3. Приклеить шапку "Журнал изменений" сверху.
//   4. Если содержимое изменилось — добавить в индекс, чтобы CHANGELOG
//      шёл в одном коммите с кодом.
//
// Что НЕ делает:
//   - Не инкрементирует версии (это задача release-please / standard-version).
//   - Не создаёт теги.
//   - Не правит историю коммитов.

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  console.warn('  ⚠ check-changelog: не git-репозиторий, пропускаю');
  process.exit(0);
}

process.chdir(ROOT);

// 1. Определяем начало диапазона: последний тег, если есть.
const lastTag = sh('git describe --tags --abbrev=0');
const fromArg = lastTag || null;

// 2. Грузим библиотеки и наш writerOpts.
let conventionalChangelog;
let writerOpts;
try {
  conventionalChangelog = require('conventional-changelog');
  const config = require(join(ROOT, '.changelog-config.cjs'));
  writerOpts = config.writerOpts || {};
} catch (err) {
  console.error('  ✗ check-changelog: библиотеки conventional-changelog не найдены.');
  console.error(
    '    Установите: npm install --save-dev conventional-changelog conventional-changelog-angular',
  );
  console.error(`    Причина: ${err.message}`);
  process.exit(1);
}

// 3. Запускаем генерацию.
// Сигнатура conventionalChangelog:
//   conventionalChangelog(options, context, gitRawCommitsOpts, parserOpts, writerOpts)
// releaseCount не указываем: conventional-changelog тогда сгенерирует один блок
// для всех коммитов начиная с fromArg. С releaseCount: 1 в случае «без тегов»
// получается несколько дублирующихся блоков.
const stream = conventionalChangelog(
  {
    preset: 'angular',
    from: fromArg,
  },
  {}, // context
  null, // gitRawCommitsOpts
  null, // parserOpts
  writerOpts, // writerOpts — здесь наши русские заголовки и шаблоны
);

let generated = '';
stream.on('data', (chunk) => {
  generated += chunk.toString();
});
stream.on('error', (err) => {
  console.error('  ✗ check-changelog: ошибка генерации:', err.message);
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

  // Заменяем CHANGELOG.md целиком: HEADER + новый блок. Это идемпотентно.
  const final = HEADER + '\n' + generated;

  const oldContent = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8') : '';
  if (final.trim() === oldContent.trim()) {
    console.log('  • CHANGELOG.md не требует обновления');
    return;
  }

  writeFileSync('CHANGELOG.md', final);
  execSync('git add CHANGELOG.md', { stdio: 'inherit' });
  console.log('  • CHANGELOG.md обновлён и добавлен в коммит');
});
