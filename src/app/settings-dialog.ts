/** Перемещает одну панель настроек между оболочкой и мобильным диалогом. */
export class SettingsDialog {
    private readonly heading: HTMLElement;
    private readonly toggleVisibility: ResizeObserver | null;

    /** Связывает окно, кнопку открытия и панель, общую для двух режимов. */
    constructor(
        private readonly dialog: HTMLDialogElement,
        private readonly toggle: HTMLButtonElement,
        private readonly panel: HTMLElement,
        private readonly desktopHost: HTMLElement,
        private readonly onToggleFocused: () => void,
    ) {
        this.heading = dialog.querySelector('h2')!;
        this.toggleVisibility = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(([entry]) => {
            if (entry?.contentRect.width === 0) this.close();
        });

        dialog.addEventListener('click', event => {
            if (event.target === dialog
                || event.target instanceof Element && event.target.closest('[data-close-settings]')) this.close();
        });
        dialog.addEventListener('close', () => this.restorePanel());
    }

    /** Устанавливает заголовок и скрывает кнопку на экранах без настроек. */
    setTitle(title: string | null): void {
        this.toggle.hidden = title === null;
        if (title !== null) this.heading.textContent = title;
    }

    /** Открывает окно и следит за видимостью кнопки при изменении ширины. */
    show(): void {
        if (this.toggle.hidden || this.dialog.open) return;
        this.dialog.append(this.panel);
        this.dialog.showModal();
        this.toggle.setAttribute('aria-expanded', 'true');
        this.toggleVisibility?.observe(this.toggle);
    }

    /** Закрывает окно и возвращает панель в оболочку. */
    close(): void {
        if (this.dialog.open) this.dialog.close();
        this.restorePanel();
    }

    /** Возвращает панель и восстанавливает фокус также при закрытии по Escape. */
    private restorePanel(): void {
        if (this.dialog.open || this.panel.parentElement !== this.dialog) return;
        this.toggleVisibility?.disconnect();
        this.toggle.setAttribute('aria-expanded', 'false');
        this.desktopHost.append(this.panel);
        if (this.dialog.ownerDocument.activeElement === this.toggle) this.onToggleFocused();
    }
}
