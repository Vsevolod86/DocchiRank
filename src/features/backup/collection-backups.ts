import type { Collection } from '../../entities/collection/model';
import { parseCollectionBackup, serializeCollectionBackup } from '../../storage/collection-backup';
import type { CollectionStore } from '../../storage/collection-store';

/** Текущий предпросмотр и результат последней операции с резервной копией. */
export interface BackupPreview {
  pending: Collection | null;
  error: string | null;
  message: string;
}

/** Читает и восстанавливает резервные копии независимо от источника текста и DOM. */
export class CollectionBackups {
  private current: BackupPreview = { pending: null, error: null, message: '' };

  /** Использует существующие коллекции для проверки цели замены. */
  constructor(private readonly store: Pick<CollectionStore, 'get'>) {}

  /** Возвращает состояние последнего запроса для отображения. */
  get preview(): Readonly<BackupPreview> { return this.current; }

  /** Сбрасывает прежний предпросмотр и сообщает, применился ли результат чтения. */
  async read(readText: () => Promise<string>, onStart: () => void): Promise<boolean> {
    const preview: BackupPreview = { pending: null, error: null, message: '' };
    this.current = preview;
    onStart();
    try {
      const text = await readText();
      if (this.current !== preview) return false;
      preview.pending = parseCollectionBackup(text);
    } catch (error) {
      if (this.current !== preview) return false;
      preview.error = error instanceof Error ? error.message : 'Не удалось прочитать копию.';
    }
    return true;
  }

  /** Возвращает подтверждённую копию или снимок для замены существующей коллекции. */
  restore(asCopy: boolean): Collection | null {
    if (!this.current.pending) return null;
    const restored = structuredClone(this.current.pending);
    if (!asCopy && !this.store.get(restored.id)) return null;
    if (asCopy) {
      restored.id = `collection:${crypto.randomUUID()}`;
      restored.name += ' (копия)';
    }
    if (restored.profile.source === 'demo') {
      restored.profile = { ...restored.profile, id: restored.id, source: 'saved-selection' };
    }
    this.current = { pending: null, error: null, message: 'Резервная копия восстановлена.' };
    return restored;
  }

  /** Закрывает предпросмотр и делает незавершённое чтение неактуальным. */
  cancel(): void {
    this.current = { ...this.current, pending: null };
  }
}

/** Готовит содержимое резервной копии и имя файла для скачивания. */
export function exportBackup(collection: Collection): { filename: string; text: string } {
  const nickname = collection.profile.nickname.replace(/[^\p{L}\p{N}._-]/gu, '_');
  return { filename: `docchirank-${nickname}.json`, text: serializeCollectionBackup(collection) };
}
