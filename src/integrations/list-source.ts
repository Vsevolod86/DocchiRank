import type { ListMedia, Profile, SourceSnapshot } from '../entities/collection/model';

/** Наблюдаемый прогресс чтения профиля, проверки доступа и загрузки списка. */
export interface ImportProgress {
  stage: 'profile' | 'access' | 'entries' | 'metadata' | 'waiting';
  loaded: number;
  total?: number;
  waitSeconds?: number;
}

/** Отмена и уведомления о прогрессе без зависимости от компонентов интерфейса. */
export interface ImportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
}

/** Категория списка для источников с несколькими каталогами. */
export interface ListLoadOptions extends ImportOptions {
  media?: ListMedia;
}

/** Источник списка, изолированный от выбора произведений, сортировки и хранения. */
export interface ListSource {
  /** Загружает снимок списка для указанного профиля или демонстрационного источника. */
  load(profileInput: string, options?: ListLoadOptions): Promise<SourceSnapshot>;
}

/** Результат подгрузки, включающий завершённые пакеты даже при отказе или отмене. */
export interface MetadataResult {
  snapshot: SourceSnapshot;
  matched: number;
  error: Error | null;
}

/** Источник списка с отдельным чтением профиля и публичных сведений о произведениях. */
export interface ListMetadataSource extends ListSource {
  /** Проверяет существование профиля без чтения его списка. */
  lookupProfile(profileInput: string, options?: ImportOptions): Promise<Profile>;

  /** Дополняет метаданные, не запрашивая профиль и не меняя исходные пользовательские записи. */
  enrich(source: SourceSnapshot, options?: ImportOptions): Promise<MetadataResult>;
}
