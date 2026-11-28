/** Фильтры, которые применяются при первом открытии набора. */
export const SELECTION_DEFAULTS = {
    statuses: ['completed', 'rewatching'], // Просмотрено и пересматриваю. Пустой массив включает все статусы.
    kinds: { // Пустой массив включает все типы выбранной категории.
        anime: ['tv', 'movie', 'ona'], // Сериал, фильм и ONA.
        manga: [],
    },
    score: { min: 1, max: 10, unratedOnly: false }, // Границы личной оценки и флаг «Только без оценки».
    selection: 'neutral', // neutral — все тайтлы, include — отмеченные, exclude — неотмеченные.
} as const;
