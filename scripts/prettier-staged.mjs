#!/usr/bin/env node
// Прогоняет prettier --check только по файлам, которые сейчас в индексе git.
// Это дешевле, чем проверять весь репозиторий, и укладывается в пару секунд
// даже на крупном PR.
//
// Файлы, которые prettier не умеет форматировать, пропускаются — это не наша
// задача.

import { execSync } from 'node:child_process';

const staged = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

// prettier умеет работать с .ts, .tsx, .tsp, .md, .json, .css и т.д.
const supported = staged.filter((f) => /\.(ts|tsx|tsp|js|mjs|cjs|json|md|css|yml|yaml)$/i.test(f));

if (supported.length === 0) process.exit(0);

try {
  execSync(`npx --no-install prettier --check ${supported.map((f) => `"${f}"`).join(' ')}`, {
    stdio: 'inherit',
  });
} catch {
  console.error('✗ prettier: перечисленные файлы не отформатированы.');
  console.error('  Запустите: npx prettier --write <файлы>  или  npm run format');
  console.error('  Чтобы обойти: git commit --no-verify');
  process.exit(1);
}
