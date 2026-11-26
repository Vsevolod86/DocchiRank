/** Независимые секции правой панели в порядке их отображения. */
export interface SidePanelView {
  className: string;
  label: string;
  sections: Partial<Record<'distribution' | 'settings' | 'history', string>>;
}

/** Разметка отдельного участка страницы и его способ обновления. */
export interface PageDetail {
  id: string;
  markup: string;
  replace?: (slot: HTMLElement, markup: string) => void;
}

/** Разметка основного участка страницы, нижней и боковой панелей. */
export interface PageView {
  content: string;
  footer?: string;
  details: PageDetail[];
  panel: SidePanelView | null;
}
