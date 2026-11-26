import { mergeAnimeMetadata } from '../../entities/collection/anime-metadata';
import { createCollection } from '../../entities/collection/collection';
import type { Collection, ListMedia, SourceSnapshot } from '../../entities/collection/model';
import { listMedia } from '../../entities/collection/model';
import { mergeImportedList } from '../../entities/collection/reimport';
import type { ListMetadataSource, ListSource, ImportOptions, ImportProgress } from '../../integrations/list-source';
import { ImportError, parseProfileInput } from '../../integrations/shikimori-data';
import { parseShikimoriExport } from '../../integrations/shikimori-json';
import type { CollectionStore } from '../../storage/collection-store';

/** Данные операции импорта или подгрузки метаданных. */
export interface ImportStatus {
  method: ImportMethod | 'metadata';
  media: ListMedia;
  profileInput: string;
  loading: boolean;
  cancellable: boolean;
  message: string;
  error: string | null;
}

/** Доступные в карточке способы импорта списка Shikimori. */
export type ImportMethod = 'profile' | 'file';

/** Источники списка для реального профиля и автономной демонстрации. */
export interface ImportSources {
  demo: ListSource;
  shikimori: ListMetadataSource;
}

/** Связывает сценарий с активной коллекцией, сохранением и уведомлениями. */
interface ImportCallbacks {
  currentCollection(): Collection | null;
  apply(collection: Collection, reason: 'import' | 'restore' | 'update'): void;
  save(collection: Collection): Promise<void>;
  onChange(event: 'start' | 'finish'): void;
  onProgress(message: string): void;
}

/** Выполняет импорт списка и отменяемую подгрузку метаданных. */
export class ListImport {
  private controller: AbortController | null = null;
  private state: ImportStatus = { method: 'profile', media: 'anime', profileInput: '', loading: false, cancellable: false, message: '', error: null };

  /** Принимает источники, хранилище и операции с коллекцией. */
  constructor(private readonly sources: ImportSources, private readonly store: CollectionStore, private readonly callbacks: ImportCallbacks) {}

  /** Возвращает состояние текущей операции. */
  get status(): Readonly<ImportStatus> { return this.state; }

  /** Запоминает ввод при переключении формы. */
  rememberInput(input: string): void { this.state.profileInput = input; }

  /** Запоминает категорию для импорта по нику и повторной загрузки. */
  rememberMedia(media: ListMedia): void { this.state.media = media; }

  /** Убирает ошибку и задаёт новое сообщение. */
  resetFeedback(message = ''): void {
    this.state.error = null;
    this.state.message = message;
  }

  /** Обновляет сообщение, сохраняя состояние последнего импорта. */
  setMessage(message: string): void { this.state.message = message; }

  /** Отменяет текущую сетевую операцию. */
  cancel(): void { this.controller?.abort(); }

  /** Восстанавливает демонстрацию из памяти или создаёт её из исходного набора. */
  async loadDemo(): Promise<Collection> {
    const snapshot = await this.sources.demo.load('demo');
    const demo = this.store.get('demo') ?? createCollection(snapshot, snapshot.entries.map(entry => entry.animeId), 'demo');
    void this.store.set(demo);
    return demo;
  }

  /** Извлекает ник до начала загрузки и использует его в статусе и запросе. */
  async importProfile(input: string, media = this.state.media): Promise<void> {
    if (this.state.loading) return;
    this.state.media = media;
    let nickname: string;
    try { nickname = parseProfileInput(input); }
    catch (error) {
      if (!(error instanceof ImportError)) throw error;
      this.state = { ...this.state, method: 'profile', profileInput: input, message: '', error: error.message };
      this.callbacks.onChange('finish');
      return;
    }
    return this.importList('profile', options => this.sources.shikimori.load(nickname, { ...options, media }), nickname);
  }

  /** Читает выгрузку Shikimori и передаёт её в общий процесс импорта. */
  importFile(filename: string, readText: () => Promise<string>): Promise<void> {
    return this.importList('file', async () => parseShikimoriExport(await readText(), filename), this.state.profileInput);
  }

  /** Сохраняет полный список и дополняет публичными полями только JSON-выгрузку. */
  private async importList(method: ImportMethod, read: (options: ImportOptions) => Promise<SourceSnapshot>, input: string): Promise<void> {
    if (this.state.loading) return;
    this.state.profileInput = input;
    const message = method === 'file' ? 'Читаю JSON-файл…' : 'Загружаю профиль…';
    const options = this.start(method, message, method !== 'file');
    try {
      await this.applyImportedList(await read(options));
    } catch (error) {
      this.state.message = '';
      if (error instanceof ImportError && error.code === 'cancelled') this.state.message = error.message;
      else this.state.error = error instanceof Error ? error.message : 'Не удалось загрузить список. Попробуй ещё раз.';
      return;
    } finally {
      this.finish();
    }
    if (method === 'file') await this.enrichCollection();
  }

  /** Обновляет нужную коллекцию, сохраняя её ID, выборку и кэш метаданных файлового импорта. */
  private async applyImportedList(snapshot: SourceSnapshot): Promise<void> {
    const collection = this.callbacks.currentCollection();
    const { id: profileId, source: sourceKind, nickname } = snapshot.profile;
    const media = listMedia(snapshot);
    const defaultId = media === 'manga' ? `manga:${sourceKind}:${profileId}` : `${sourceKind}:${profileId}`;
    const previous = collection?.profile.source === sourceKind && collection.profile.id === profileId && listMedia(collection) === media
      ? collection : this.store.get(defaultId);
    const source = previous && sourceKind === 'shikimori-json' ? mergeAnimeMetadata(snapshot, previous.animes) : snapshot;
    const next = previous ? mergeImportedList(previous, source) : createCollection(source, [], defaultId);
    this.callbacks.apply(next, 'import');
    if (this.state.method === 'profile') this.state.profileInput = nickname;
    this.state.message = `${previous ? 'Список обновлён' : 'Список загружен'}. Получено записей: ${snapshot.entries.length}.`;
    await this.callbacks.save(next);
  }

  /** Дополняет импортированный JSON публичными сведениями, сохраняя полученные пакеты при отмене и ошибке. */
  private async enrichCollection(): Promise<void> {
    const current = this.callbacks.currentCollection();
    if (!current || current.profile.source === 'demo' || this.state.loading) return;
    const options = this.start('metadata', 'Подгружаю сведения о тайтлах…', true);
    try {
      const result = await this.sources.shikimori.enrich(current, options);
      const updated = mergeImportedList(current, result.snapshot);
      this.callbacks.apply(updated, 'update');
      await this.callbacks.save(updated);
      this.state.message = `Получены сведения о тайтлах: ${result.matched} из ${current.animes.length}.`;
      if (result.error instanceof ImportError && result.error.code === 'cancelled') {
        this.state.message += ' Подгрузка отменена; список и полученные сведения сохранены.';
      } else if (result.error) {
        this.state.error = `Подгрузка завершена не полностью. ${result.error.message} Чтобы повторить её, импортируй тот же JSON.`;
      } else if (result.matched < current.animes.length) {
        this.state.message += ` Для ${current.animes.length - result.matched} произведений Shikimori не вернул сведения; они остались в наборе.`;
      }
    } catch {
      this.state.message = '';
      this.state.error = 'Не удалось подгрузить сведения о тайтлах. Чтобы повторить подгрузку, импортируй тот же JSON.';
    } finally {
      this.finish();
    }
  }

  /** Начинает операцию и принимает прогресс только от её источника. */
  private start(method: ImportStatus['method'], message: string, cancellable: boolean): ImportOptions {
    this.state = { ...this.state, method, loading: true, cancellable, message, error: null };
    const controller = new AbortController();
    this.controller = controller;
    this.callbacks.onChange('start');
    return { signal: controller.signal, onProgress: progress => {
      if (this.controller !== controller) return;
      this.state.message = progressMessage(progress);
      this.callbacks.onProgress(this.state.message);
    } };
  }

  /** Завершает операцию до следующего импорта или подгрузки. */
  private finish(): void {
    this.state.loading = false;
    this.state.cancellable = false;
    this.controller = null;
    this.callbacks.onChange('finish');
  }
}

/** Переводит стадии интеграции в короткие сообщения, полезные при ожидании. */
function progressMessage(progress: ImportProgress): string {
  switch (progress.stage) {
    case 'profile': return 'Загружаю профиль…';
    case 'access': return 'Проверяю доступ к списку…';
    case 'entries': return `Загружаю список. Получено записей: ${progress.loaded}.`;
    case 'metadata': return `Подгружаю данные тайтлов. Обработано: ${progress.loaded} из ${progress.total ?? progress.loaded}.`;
    case 'waiting': return `Ожидаю разрешённого времени запроса: до ${progress.waitSeconds ?? 1} с. Получено записей: ${progress.loaded}.`;
  }
}
