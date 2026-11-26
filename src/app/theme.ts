// Ключ сохраняет выбранную тему между версиями приложения.
const themeKey = 'tiersort.theme';

/** Применяет сохранённую тему к документу перед отрисовкой приложения. */
export function restoreTheme(document: Document): void {
  try {
    document.documentElement.dataset.theme = document.defaultView?.localStorage.getItem(themeKey) === 'dark' ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
}

/** Переключает тему и сохраняет выбор для следующего посещения. */
export function bindThemeToggle(button: HTMLButtonElement): void {
  const document = button.ownerDocument;
  const root = document.documentElement;
  button.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
  button.addEventListener('click', () => {
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = theme;
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    try { document.defaultView?.localStorage.setItem(themeKey, theme); }
    catch { /* Тема работает и при недоступном хранилище. */ }
  });
}
