#!/usr/bin/env node
// Прогоняет `tsc --noEmit` только по тем воркспейсам, чьи файлы попали в индекс.
// Это существенно быстрее, чем тайпчек всего репозитория, и не запускает
// компиляцию в пакетах, которые разработчик не трогал.
//
// Если в индексе есть файлы вне известных воркспейсов (например, корень
// репозитория) — это не наша забота, typecheck их пропустит.

import { execSync } from 'node:child_process';

const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const workspaces = new Set();
for (const f of staged) {
  if (f.startsWith('server/')) workspaces.add('server');
  else if (f.startsWith('web/')) workspaces.add('web');
  else if (f.startsWith('e2e/')) workspaces.add('e2e');
  // contract — TypeSpec, не TypeScript, его тайпчекать не нужно.
}

if (workspaces.size === 0) process.exit(0);

for (const ws of workspaces) {
  console.log(`  • tsc --noEmit в ${ws}`);
  try {
    execSync(`npm run typecheck --workspace ${ws}`, { stdio: 'inherit' });
  } catch {
    console.error(`✗ typecheck в ${ws} упал. Запустите: npm run typecheck --workspace ${ws}`);
    process.exit(1);
  }
}
