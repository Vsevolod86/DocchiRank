import { escapeHtml } from '../shared/lib/escape-html';

/** Группы, которые можно независимо сворачивать в боковой панели. */
export type PanelGroup = 'status' | 'kind' | 'score' | 'sort' | 'settings' | 'display' | 'filters' | 'history' | 'distribution';

/** Связывает доступный с клавиатуры заголовок с содержимым группы. */
export function panelGroupToggle(group: PanelGroup, label: string, collapsed: boolean, singleChild?: PanelGroup): string {
    return `<button type="button" class="panel-group-toggle" data-action="toggle-panel-group" data-panel-group="${group}"${singleChild ? ` data-expand-group="${singleChild}"` : ''} aria-expanded="${!collapsed}" aria-controls="panel-${group}-options" title="${collapsed ? 'Развернуть' : 'Свернуть'}: ${escapeHtml(label)}">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg><span>${escapeHtml(label)}</span>
  </button>`;
}
