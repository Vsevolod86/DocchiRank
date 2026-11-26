export const COMPARISON_SCENARIOS = [
    { key: 'new', title: 'Создать с нуля', description: 'Выбери тайтлы и построй их порядок по своим предпочтениям.', available: true },
    { key: 'add', title: 'Пополнить рейтинг', description: 'Добавь новые тайтлы в рейтинг. Остальные сохранят порядок.', available: true },
    { key: 'review', title: 'Пересмотреть места', description: 'Заново определи места для выбранных тайтлов. Порядок остальных сохранится.', available: true },
] as const;

export type ComparisonScenario = typeof COMPARISON_SCENARIOS[number]['key'];
