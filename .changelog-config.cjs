// Конфигурация conventional-changelog для нашего проекта.
//
// Подменяет стандартные английские заголовки групп (Features / Bug Fixes /
// Documentation) на русские, чтобы CHANGELOG.md сразу был на русском без
// пост-обработки.
//
// Соответствует README: feat → Новое, fix/perf → Исправления,
// docs → Документация, остальные типы не попадают в changelog.

module.exports = {
  writerOpts: {
    // Шаблон заголовка секции (Новое / Исправления / Документация).
    group: '{{~#if isPatch~}}\n### Исправления\n{{~else if isFeature~}}\n### Новое\n{{~else if isDocumentation~}}\n### Документация\n{{~else~}}\n### Прочее\n{{~/if~}}\n',

    // Подмена типа коммита в строке списка. Без этого conventional-changelog
    // выводит "**feat:** ..." в английском стиле. Оставляем только
    // человекочитаемое описание.
    commit: '- {{message}}\n',

    // Подменяем стандартные английские группы на русские. conventional-changelog
    // разделяет коммиты по типам feat, fix, perf, docs и т.д., и нам нужно
    // переименовать соответствующие группы.
    groupBy: 'type',

    // Сравнение типов для группировки.
    commitGroupsSort: ['feat', 'fix', 'perf', 'docs', 'revert'],

    // Маппинг типов → подписи в заголовке релиза. Используется, когда
    // conventional-changelog сам формирует верхний уровень CHANGELOG.
    versionComparator: 'semver',
  },
};