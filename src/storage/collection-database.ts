import type { Collection } from '../entities/collection/model';
import { BACKUP_SCHEMA_VERSION } from './backup';
import type { BackupFile } from './backup';
import { packCollection, readCollectionBackup } from './collection-backup';

// Имя базы служит постоянным идентификатором сохранённых коллекций в браузере.
const DATABASE = 'tiersort';
const COLLECTIONS = 'collections';

/** Версия записи нужна для обнаружения параллельных изменений одной коллекции. */
export interface CollectionRecord extends BackupFile {
  revision: number;
}

export type CollectionSaveResult = 'saved' | 'conflict' | 'failed';

/** Открывает базу и создаёт хранилище коллекций при первом запуске. */
export function openCollectionDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Другая вкладка блокирует открытие хранилища коллекций.'));
    };
    request.onupgradeneeded = () => {
      const transaction = request.transaction!;
      if (blocked) {
        transaction.abort();
        return;
      }
      request.result.createObjectStore(COLLECTIONS, { keyPath: 'collection.id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) database.close();
      else {
        database.onversionchange = () => database.close();
        resolve(database);
      }
    };
  });
}

/** Читает актуальные записи независимо, чтобы одна повреждённая коллекция не скрывала остальные. */
export function readCollectionRecords(database: IDBDatabase): Promise<{ collection: Collection; revision: number }[]> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(COLLECTIONS, 'readonly');
    const request = transaction.objectStore(COLLECTIONS).getAll();
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => {
      const records: { collection: Collection; revision: number }[] = [];
      for (const value of request.result) {
        if (!validRevision(value?.revision)) continue;
        try {
          const collection = readCollectionBackup(value);
          if (collection.profile.source !== 'demo') {
            records.push({ revision: value.revision, collection });
          }
        } catch {
          // Следующая запись читается независимо.
        }
      }
      resolve(records);
    };
  });
}

/** Сверяет версию и сохраняет запись в одной транзакции, сообщая результат после её завершения. */
export function writeCollectionRecord(database: IDBDatabase, collection: Collection, revision: number): Promise<CollectionSaveResult> {
  return new Promise(resolve => {
    const transaction = database.transaction(COLLECTIONS, 'readwrite');
    const store = transaction.objectStore(COLLECTIONS);
    const request = store.get(collection.id);
    let result: CollectionSaveResult = 'failed';
    transaction.onabort = () => resolve('failed');
    transaction.oncomplete = () => resolve(result);
    request.onsuccess = () => {
      const previous = request.result as CollectionRecord | undefined;
      if (previous && (previous.schemaVersion !== BACKUP_SCHEMA_VERSION || !validRevision(previous.revision))) return;
      if ((previous?.revision ?? 0) !== revision) {
        result = 'conflict';
        return;
      }
      if (!validRevision(revision + 1)) return;
      try {
        store.put({ ...packCollection(collection), revision: revision + 1 } satisfies CollectionRecord);
        result = 'saved';
      } catch {
        transaction.abort();
      }
    };
  });
}

/** Проверяет версию сохранённой записи и её следующий номер. */
function validRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
