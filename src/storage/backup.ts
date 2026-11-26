import type { Collection } from '../entities/collection/model';
import type { StoredSortingSession } from '../entities/sorting/session';

export const BACKUP_SCHEMA_VERSION = 2 as const;

/** Запись сессии в резервной копии хранит только данные для воспроизведения. */
interface BackupCollection extends Omit<Collection, 'session' | 'archivedSessions' | 'orderedIds'> {
  session: StoredSortingSession | null;
  archivedSessions?: StoredSortingSession[];
  orderedIds?: string[];
}

/** Переносимая копия одной коллекции, проверяемая перед восстановлением. */
export interface BackupFile {
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  collection: BackupCollection;
}
