#!/usr/bin/env node
// Защищает правило «не править contract/openapi.yaml руками».
// Если в индексе изменился contract/main.tsp, пересобирает openapi.yaml
// и проверяет, что собранный файл действительно обновился. Если нет —
// отказывает в коммите.
//
// Если же изменился только openapi.yaml без main.tsp — это уже нарушение
// правила, и коммит тоже отклоняется.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const tspChanged = staged.some((f) => f.startsWith('contract/') && f.endsWith('.tsp'));
const openapiChanged = staged.includes('contract/openapi.yaml');

if (openapiChanged && !tspChanged) {
  console.error('✗ contract/openapi.yaml изменился без изменения contract/main.tsp.');
  console.error('  Этот файл собирается из TypeSpec компилятором. Правьте contract/main.tsp');
  console.error('  и запустите: npm run contract:build');
  process.exit(1);
}

if (!tspChanged) process.exit(0);

console.log('  • contract/main.tsp изменился, пересобираю contract/openapi.yaml...');

// Снимаем файл из индекса, чтобы пересборка его не помешала.
execSync('git restore --staged contract/openapi.yaml', { stdio: 'inherit' });
execSync('npm run contract:build', { stdio: 'inherit' });

if (!existsSync('contract/openapi.yaml')) {
  console.error('✗ сборка контракта не создала contract/openapi.yaml');
  process.exit(1);
}

const diffAfter = execSync('git diff --name-only contract/openapi.yaml', {
  encoding: 'utf8',
}).trim();
if (!diffAfter) {
  console.error('✗ contract/main.tsp изменился, но contract/openapi.yaml не пересобран.');
  console.error('  Запустите вручную: npm run contract:build');
  process.exit(1);
}

// Возвращаем собранный файл в индекс.
execSync('git add contract/openapi.yaml', { stdio: 'inherit' });
console.log('  • contract/openapi.yaml обновлён и добавлен в коммит.');
