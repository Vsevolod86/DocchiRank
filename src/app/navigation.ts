import { canStartComparison } from '../entities/collection/comparison';
import type { Collection } from '../entities/collection/model';
import type { CollectionCommands } from '../features/collection/collection-commands';
import type { ComparisonScenario } from '../features/collection/comparison-scenarios';

export type Screen = 'import' | 'selection' | 'comparison' | 'result';

const screens = [
    { id: 'import', title: 'Импорт', caption: 'Загрузи список', icon: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/>' },
    { id: 'selection', title: 'Набор', caption: 'Выбери произведения', icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="m14 17 3 3 5-6"/>' },
    { id: 'comparison', title: 'Сравнение', caption: 'Выбери из двух', icon: '<rect x="2" y="5" width="8" height="14" rx="2"/><rect x="14" y="5" width="8" height="14" rx="2"/>' },
    { id: 'result', title: 'Результат', caption: 'Порядок и оценки', icon: '<path d="M8 5h13M8 12h10M8 19h7M3 5h.01M3 12h.01M3 19h.01"/>' },
] as const;

/** Выбирает экран приложения и запоминает, куда вернуться при отмене пересмотра. */
export class AppNavigation {
    private current: Screen = 'import';
    private revisionOrigin: 'comparison' | 'result' | null = null;

    /** Использует только состояние и команды пересмотра активной коллекции. */
    constructor(private readonly commands: Pick<CollectionCommands, 'view' | 'openRevision' | 'cancelRevision'>) { }

    /** Возвращает текущий шаг приложения. */
    get screen(): Screen { return this.current; }

    /** Определяет экран по ходу сессии после ответа, запуска или восстановления. */
    get comparisonProgressScreen(): 'comparison' | 'result' {
        const { sorting, comparisonRevision } = this.commands.view;
        return sorting?.status === 'complete' && !comparisonRevision ? 'result' : 'comparison';
    }

    /** Открывает запрошенный экран, завершая пересмотр при выходе из сравнения. */
    show(destination: Screen): void {
        if (destination !== 'comparison') this.commands.cancelRevision();
        if (!this.commands.view.comparisonRevision) this.revisionOrigin = null;
        this.current = destination;
    }

    /** Открывает пересмотр из сравнения или результата и запоминает предыдущий шаг. */
    openRevision(eventId: string): void {
        if (this.current !== 'comparison' && this.current !== 'result') return;
        if (!this.commands.openRevision(eventId)) return;
        this.revisionOrigin = this.current;
        this.show('comparison');
    }

    /** Закрывает пересмотр и возвращает шаг, который был открыт до него. */
    cancelRevision(): void {
        this.commands.cancelRevision();
        this.show(this.revisionOrigin ?? 'comparison');
    }
}

/** Сопоставляет атрибут элемента с допустимым шагом приложения. */
export function screenFromAttribute(value: string | undefined): Screen | undefined {
    return screens.find(step => step.id === value)?.id;
}

/** Вычисляет доступность шагов и нового сравнения по состоянию коллекции. */
export function navigationAvailability(collection: Collection | null, scenario: ComparisonScenario, loading: boolean) {
    const ready = !loading;
    const hasSession = Boolean(collection?.session);
    const canCompare = collection !== null && canStartComparison(collection, scenario);
    return {
        canCompare,
        screens: {
            import: ready,
            selection: ready && collection !== null,
            comparison: ready && (hasSession || canCompare),
            result: ready && hasSession,
        },
    };
}

/** Формирует навигацию шагов с текущим положением и доступными действиями. */
export function navigationMarkup(screen: Screen, available: Readonly<Record<Screen, boolean>>): string {
    return screens.map(step => `<button class="nav-step ${screen === step.id ? 'active' : ''}" data-screen="${step.id}"
          ${screen === step.id ? 'aria-current="step"' : ''} ${available[step.id] ? '' : 'disabled'}>
          <span class="step-icon" aria-hidden="true">${stepIcon(step.id)}</span>
          <span><strong>${step.title}</strong><small>${step.caption}</small></span>
        </button>`).join('');
}

/** Возвращает значок шага для навигации и карточки импорта. */
export function stepIcon(screen: Screen): string {
    const icon = screens.find(step => step.id === screen)!.icon;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
}
