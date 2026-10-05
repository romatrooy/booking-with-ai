#!/usr/bin/env node
// Устанавливает git-хуки из папки hooks/ в корне репозитория.
// Идемпотентен — можно запускать сколько угодно раз.
//
// Что делает:
//   1. Проверяет, что мы внутри git-репозитория.
//   2. Если core.hooksPath не указывает на нашу папку hooks/ — настраивает.
//   3. Делает файлы хуков исполняемыми (нужно для Unix и Git for Windows).
//
// Запускается автоматически через npm-скрипт prepare после npm install.

import { execSync } from 'node:child_process';
import { existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

function runQuiet(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// 1. Проверяем, что мы в git-репозитории.
const toplevel = runQuiet('git rev-parse --show-toplevel');
if (!toplevel) {
  console.warn('⚠ install-hooks: не git-репозиторий, хуки не настроены');
  process.exit(0);
}

// 2. Проверяем нашу папку hooks/.
const hooksDir = join(toplevel, 'hooks');
if (!existsSync(hooksDir)) {
  console.warn(`⚠ install-hooks: папка ${hooksDir} не найдена`);
  process.exit(0);
}

// 3. Настраиваем core.hooksPath.
const currentPath = runQuiet('git config --get core.hooksPath');
const desiredPath = 'hooks';

if (currentPath !== desiredPath) {
  execSync(`git config core.hooksPath ${desiredPath}`, { stdio: 'inherit' });
  console.log(`✓ install-hooks: core.hooksPath → ${desiredPath}`);
} else {
  console.log(`✓ install-hooks: core.hooksPath уже указывает на ${desiredPath}`);
}

// 4. Делаем файлы хуков исполняемыми.
const hooks = ['pre-commit', 'commit-msg'];
for (const hook of hooks) {
  const path = join(hooksDir, hook);
  if (existsSync(path)) {
    try {
      chmodSync(path, 0o755);
      console.log(`✓ install-hooks: chmod +x ${hook}`);
    } catch (err) {
      console.warn(`⚠ install-hooks: не удалось chmod ${hook}: ${err.message}`);
    }
  }
}
