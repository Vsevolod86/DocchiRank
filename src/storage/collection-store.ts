import type { Collection } from '../entities/collection/model';
import { copyCollectionForStorage } from './collection-backup';
import { openCollectionDatabase, readCollectionRecords, writeCollectionRecord } from './collection-database';
import type { CollectionSaveResult } from './collection-database';

/** Граница хранения коллекций: читатель и хранилище владеют разными копиями данных. */
export interface CollectionStore {
  /** Возвращает независимую копию коллекции либо null при её отсутствии. */
  get(id: string): Collection | null;
  /** Обновляет копию в памяти и сообщает результат постоянной записи после её завершения. */
  set(collection: Collection): Promise<CollectionSaveResult>;
  /** Возвращает независимые копии всех известных коллекций. */
  list(): Collection[];
}

/** Временное хранилище демонстрации, действующее до перезагрузки страницы. */
export class MemoryCollectionStore implements CollectionStore {
  private readonly collections = new Map<string, Collection>();

  /** Возвращает независимую копию коллекции либо null при её отсутствии. */
  get(id: string): Collection | null {
    const collection = this.collections.get(id);
    return collection ? structuredClone(collection) : null;
  }

  /** Сохраняет данные без общей изменяемой памяти с вызывающим кодом. */
  async set(collection: Collection): Promise<CollectionSaveResult> {
    this.collections.set(collection.id, structuredClone(collection));
    return 'saved';
  }

  /** Перечисляет коллекции без общей изменяемой памяти. */
  list(): Collection[] {
    return Array.from(this.collections.values(), collection => structuredClone(collection));
  }
}

/** Хранит рабочие копии коллекций и версии, на основе которых вкладка вносит изменения. */
export class BrowserCollectionStore implements CollectionStore {
  private readonly collections = new Map<string, Collection>();
  private readonly revisions = new Map<string, number>();
  private readonly writes = new Map<string, Promise<CollectionSaveResult>>();

  /** Связывает рабочие копии с одним соединением IndexedDB. */
  private constructor(private readonly database: IDBDatabase | null) {}

  /** Загружает сохранения или открывает временное хранилище при недоступности базы. */
  static async open(factory = globalThis.indexedDB): Promise<BrowserCollectionStore> {
    let database: IDBDatabase | null = null;
    try {
      database = await openCollectionDatabase(factory);
      const store = new BrowserCollectionStore(database);
      for (const { collection, revision } of await readCollectionRecords(database)) {
        store.collections.set(collection.id, collection);
        store.revisions.set(collection.id, revision);
      }
      return store;
    } catch {
      database?.close();
      return new BrowserCollectionStore(null);
    }
  }

  /** Возвращает независимую копию последнего известного состояния. */
  get(id: string): Collection | null {
    const collection = this.collections.get(id);
    return collection ? structuredClone(collection) : null;
  }

  /** Ставит снимок в очередь своей коллекции, сохраняя актуальную копию при отказе или конфликте. */
  async set(collection: Collection): Promise<CollectionSaveResult> {
    let cached: Collection;
    try {
      cached = copyCollectionForStorage(collection);
    } catch {
      return 'failed';
    }
    const runtime = structuredClone(cached);
    if (collection.profile.source === 'demo') runtime.animes = structuredClone(collection.animes);
    this.collections.set(collection.id, runtime);
    if (collection.profile.source === 'demo') return 'saved';
    const database = this.database;
    if (!database) return 'failed';

    const { id } = cached;
    const write = (this.writes.get(id) ?? Promise.resolve()).then(async (): Promise<CollectionSaveResult> => {
      const revision = this.revisions.get(id) ?? 0;
      try {
        const result = await writeCollectionRecord(database, cached, revision);
        if (result === 'saved') this.revisions.set(id, revision + 1);
        return result;
      } catch {
        return 'failed';
      }
    });
    this.writes.set(id, write);
    try {
      return await write;
    } finally {
      if (this.writes.get(id) === write) this.writes.delete(id);
    }
  }

  /** Перечисляет коллекции, включая текущее несохранённое состояние после ошибки записи. */
  list(): Collection[] {
    return Array.from(this.collections.values(), collection => structuredClone(collection));
  }
}
