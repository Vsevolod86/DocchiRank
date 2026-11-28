export const GROUP_DISPLAYS = [
  { key: 'carousel', label: 'Карусель' },
  { key: 'list', label: 'Список' },
  { key: 'representative', label: 'Представитель' },
] as const;

/** Способ показа тайтлов, которые делят одно место в сравнении. */
export type GroupDisplay = typeof GROUP_DISPLAYS[number]['key'];
