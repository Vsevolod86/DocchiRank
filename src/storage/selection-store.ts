import type { SavedSelection } from '../entities/collection/model';

/** Хранилище указателя для быстрого продолжения. */
export interface SelectionStore {
  /** Читает указатель на доступную для продолжения коллекцию. */
  get(): SavedSelection | null;
  /** Записывает указатель и сообщает об успехе. */
  set(selection: SavedSelection): boolean;
}

// Ключ сохраняет доступ к уже записанному указателю на коллекцию.
const STORAGE_KEY = 'tiersort.selection';

/** Хранит ID последней коллекции в localStorage. */
export class BrowserSelectionStore implements SelectionStore {
  /** Позволяет подставить хранилище без доступа к глобальному объекту браузера. */
  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {}

  /** Читает указатель при доступном хранилище. */
  get(): SavedSelection | null {
    try {
      const raw = (this.storage ?? window.localStorage).getItem(STORAGE_KEY);
      const value: unknown = raw === null ? null : JSON.parse(raw);
      return validSelection(value) ? { collectionId: value.collectionId } : null;
    } catch {
      return null;
    }
  }

  /** Сохраняет только ID коллекции. */
  set(selection: SavedSelection): boolean {
    try {
      if (!validSelection(selection)) return false;
      (this.storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify({ collectionId: selection.collectionId }));
      return true;
    } catch {
      return false;
    }
  }
}

/** Принимает указатель с непустым строковым ID коллекции. */
function validSelection(value: unknown): value is SavedSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { collectionId } = value as Record<string, unknown>;
  return typeof collectionId === 'string' && collectionId.trim().length > 0;
}
