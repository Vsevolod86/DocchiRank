/** Настройки, с которыми открывается новая вкладка приложения. */
export const SCREEN_DEFAULTS = {
    cardLayout: 'compact', // compact — средние карточки, large — крупные, list — таблица.
    groupDisplay: 'carousel', // carousel — карусель, list — мини-обложки, representative — одна карточка.
    displayFields: { // Какие поля показаны при открытии экранов.
        russianTitle: true,
        originalTitle: true,
        status: false,
        userScore: true, // Личная оценка из исходного списка.
        communityScore: true,
        shikimoriLink: true,
    },
    listSort: {
        key: 'alphabet', // alphabet, my-score, community-score или status.
        reversed: false,
    },
    collapsedGroups: { // true — подраздел свёрнут при открытии.
        status: false,
        kind: true, // Тип произведения.
        score: true, // Фильтр личной оценки.
        sort: false,
        settings: true, // Общая панель настроек на сравнении и в результате.
        display: true, // Подраздел «Отображение».
        filters: false,
        history: true,
        distribution: false, // Распределение оценок на экране результата.
    },
    selectionSettingsCollapsed: false, // Состояние общей панели настроек на экране набора.
    scenario: 'new', // new — с нуля, add — пополнить рейтинг, review — пересмотреть места.
    importMode: 'profile', // profile — по нику или ссылке, file — из JSON.
} as const;

export const DEFAULT_THEME: 'light' | 'dark' = 'light'; // Тема, пока в браузере нет сохранённого выбора.
export const DEFAULT_IMPORT_MEDIA = 'anime'; // Категория импорта по нику. manga — манга и ранобэ.

// Время в полях с суффиксом Ms указано в миллисекундах.
export const INTERFACE_TIMING = {
    groupCarouselMs: 2_000, // Время между сменами карточек группы.
    downloadNoticeMs: 5_000, // Длительность уведомления перед скачиванием оценок.
    downloadNoticeRepeatChance: 0.2, // Шанс повторного показа от 0 до 1. Первый показ гарантирован.
} as const;

// key — сочетание клавиш. label — его подпись в подсказке.
export const COMPARISON_KEYS = {
    left: { key: 'ArrowLeft', label: '←' },
    right: { key: 'ArrowRight', label: '→' },
    tie: { key: 'ArrowDown', label: '↓' }, // Ответ «Одинаково».
    skip: { key: 'Space', label: 'Пробел' },
    undo: { key: 'Control+Z', code: 'KeyZ', label: 'Ctrl+Z' }, // code привязывает отмену к физической клавише независимо от раскладки.
} as const;
