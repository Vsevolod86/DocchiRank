import type { Collection, SavedSelection } from '../../entities/collection/model';
import { listMedia } from '../../entities/collection/model';
import type { CollectionStore } from '../../storage/collection-store';
import type { SelectionStore } from '../../storage/selection-store';

const resumeError = 'Коллекция сохранена, но не удалось обновить быстрый доступ к продолжению.';

/** Отдельно отслеживает запись каждой коллекции и последний указатель продолжения. */
export class SelectionPersistence {
  private saveSequence = 0;
  private selectionSequence = 0;
  private resumeId: string | null;
  private readonly pendingSaves = new Map<string, number>();
  private readonly saveErrors = new Map<string, string>();

  /** Принимает хранилища и последний указатель продолжения. */
  constructor(
    private readonly store: CollectionStore,
    private readonly selectionStore: SelectionStore | undefined,
    saved: SavedSelection | null,
  ) {
    this.resumeId = saved?.collectionId ?? null;
  }

  /** Готовит список сохранений и сведения о записи активной коллекции. */
  summary(activeId?: string) {
    const collections = this.store.list().filter(item => item.profile.source !== 'demo')
      .map(item => ({ id: item.id, name: item.name, nickname: item.profile.nickname, media: listMedia(item), selectedCount: item.selectedIds.length }));
    const resumeCollectionId = collections.some(item => item.id === this.resumeId)
      ? this.resumeId : collections[0]?.id ?? null;
    return { collections, resumeCollectionId, saveError: activeId ? this.saveErrors.get(activeId) ?? null : null };
  }

  /** Возвращает коллекцию, которую сейчас предлагает продолжить приложение. */
  resumeCollection(): Collection | null {
    const id = this.summary().resumeCollectionId;
    return id === null ? null : this.store.get(id);
  }

  /** Выбирает коллекцию с существующим сохранением для быстрого продолжения. */
  preferCollection(id: string): boolean {
    if (!this.store.get(id)) return false;
    this.resumeId = id;
    return true;
  }

  /** Обновляет указатель после открытия без повторной записи коллекции. */
  rememberOpened(collection: Collection): void {
    if (this.pendingSaves.has(collection.id) || this.saveErrors.has(collection.id)) return;
    this.selectionSequence = ++this.saveSequence;
    if (!this.remember(collection.id)) this.saveErrors.set(collection.id, resumeError);
  }

  /** Возвращает ошибку актуальной записи или undefined, если уведомление не нужно. */
  async save(collection: Collection): Promise<string | null | undefined> {
    const id = collection.id;
    const write = this.store.set(collection);
    if (collection.profile.source === 'demo') return;
    const ticket = ++this.saveSequence;
    this.pendingSaves.set(id, ticket);
    const result = await write;

    let error: string | null = null;
    if (result === 'conflict') {
      error = 'Эта коллекция изменилась в другой вкладке. Экспортируй изменения из этой вкладки перед перезагрузкой.';
    } else if (result === 'failed') {
      error = 'Не удалось сохранить коллекцию в браузере. Прогресс остаётся в этой вкладке. Экспортируй резервную копию.';
    } else if (ticket > this.selectionSequence) {
      this.selectionSequence = ticket;
      if (!this.remember(id)) error = resumeError;
    }

    if (this.pendingSaves.get(id) !== ticket) return;
    this.pendingSaves.delete(id);
    if (error) this.saveErrors.set(id, error);
    else this.saveErrors.delete(id);
    return error;
  }

  /** Сохраняет указатель и запоминает его для текущей вкладки. */
  private remember(collectionId: string): boolean {
    if (this.selectionStore && !this.selectionStore.set({ collectionId })) return false;
    this.resumeId = collectionId;
    return true;
  }
}
