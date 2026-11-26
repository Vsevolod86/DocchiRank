import type { Profile, SourceSnapshot } from '../entities/collection/model';
import { listMedia } from '../entities/collection/model';
import { mergeAnimeMetadata } from '../entities/collection/anime-metadata';
import { validateSourceSnapshot } from '../entities/collection/collection';
import type { ListMetadataSource, ImportOptions, ImportProgress, ListLoadOptions, MetadataResult } from './list-source';
import { cancelledImport, collectShikimoriList, ImportError, invalidResponse, parseProfile, parseProfileInput, parseWorkPage, SHIKIMORI_ORIGIN, SHIKIMORI_TARGET_TYPE } from './shikimori-data';

const workFields = 'id name russian url score kind poster { mainUrl }';

/** Читает открытые списки напрямую из браузера и последовательно дозирует все запросы. */
export class ShikimoriSource implements ListMetadataSource {
  private tail: Promise<unknown> = Promise.resolve();
  private notBefore = 0;

  /** Использует штатный Fetch либо переданный транспорт для управляемых проверок. */
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  /** Загружает все страницы списка вместе с публичными метаданными произведений. */
  async load(profileInput: string, options: ListLoadOptions = {}): Promise<SourceSnapshot> {
    const media = options.media ?? 'anime';
    const profile = await this.lookupProfile(profileInput, options);
    const access = await this.request(`/api/users/${profile.id}/${media}_rates?limit=1&page=1`, {}, options, { stage: 'access', loaded: 0 });
    if (access !== null && !Array.isArray(access)) throw invalidResponse();

    return collectShikimoriList(async (page, loaded) => {
      const query = `{ userRates(userId: "${profile.id}", targetType: ${SHIKIMORI_TARGET_TYPE[media]}, limit: 50, page: ${page}) {
        id score status ${media} { ${workFields} }
      } }`;
      const result = await this.request('/api/graphql', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
      }, options, { stage: 'entries', loaded });
      return { profile, result };
    }, options, media);
  }

  /** Проверяет ник через публичный API, не запрашивая список профиля. */
  async lookupProfile(profileInput: string, options: ImportOptions = {}): Promise<Profile> {
    const nickname = parseProfileInput(profileInput);
    const rawProfile = await this.request(`/api/users/${encodeURIComponent(nickname)}?is_nickname=1`, {}, options, { stage: 'profile', loaded: 0 });
    return parseProfile(rawProfile);
  }

  /** Читает публичные метаданные пакетами по 50, сохраняя завершённые пакеты при отказе. */
  async enrich(source: SourceSnapshot, options: ImportOptions = {}): Promise<MetadataResult> {
    validateSourceSnapshot(source);
    const media = listMedia(source);
    if (source.animes.some(work => !/^[1-9]\d*$/.test(work.id))) throw new ImportError('input', 'Для подгрузки нужны ID тайтлов Shikimori.');
    let snapshot = structuredClone(source);
    let matched = 0;
    try {
      for (let offset = 0; offset < source.animes.length; offset += 50) {
        const ids = source.animes.slice(offset, offset + 50).map(anime => anime.id);
        const query = `query($ids: String!) { ${media}s(ids: $ids, limit: 50) { ${workFields} } }`;
        const response = await this.request('/api/graphql', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables: { ids: ids.join(',') } }),
        }, options, { stage: 'metadata', loaded: offset, total: source.animes.length });
        const metadata = parseWorkPage(response, media);
        if (new Set(metadata.map(anime => anime.id)).size !== metadata.length || metadata.some(anime => !ids.includes(anime.id))) throw invalidResponse();
        snapshot = mergeAnimeMetadata(snapshot, metadata);
        matched += metadata.length;
        options.onProgress?.({ stage: 'metadata', loaded: offset + ids.length, total: source.animes.length });
      }
      if (options.signal?.aborted) throw cancelledImport();
      return { snapshot, matched, error: null };
    } catch (error) {
      if (!(error instanceof ImportError)) throw error;
      const metadataError = error.code === 'forbidden' || error.code === 'not-found'
        ? new ImportError(error.code, 'Shikimori не предоставил публичные сведения о тайтлах. Попробуй позже.') : error;
      return { snapshot, matched, error: metadataError };
    }
  }

  /** Сериализует обращения одного адаптера, включая повторные импорты и неудачные запросы. */
  private request(path: string, init: RequestInit, options: ImportOptions, progress: ImportProgress): Promise<unknown> {
    const response = this.tail.then(() => this.fetchJson(path, init, options, progress));
    this.tail = response.catch(() => {});
    return response;
  }

  /** Выполняет запрос без cookies и токена с тайм-аутом и обработкой охлаждения после 429. */
  private async fetchJson(path: string, init: RequestInit, options: ImportOptions, progress: ImportProgress): Promise<unknown> {
    const delay = this.notBefore - Date.now();
    if (delay > 1000) options.onProgress?.({ stage: 'waiting', loaded: progress.loaded, waitSeconds: Math.ceil(delay / 1000) });
    await wait(delay, options.signal);
    options.onProgress?.(progress);
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 20_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
    try {
      // Браузерный Fetch нельзя вызывать с экземпляром адаптера в качестве this.
      const fetcher = this.fetcher;
      const response = await fetcher(new URL(path, SHIKIMORI_ORIGIN), {
        ...init, credentials: 'omit', signal, headers: { Accept: 'application/json', ...init.headers },
      });
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const retryAt = Number.isFinite(seconds) && seconds >= 0 ? Date.now() + seconds * 1000 : Date.parse(retryAfter ?? '');
        this.notBefore = Math.max(Date.now() + 800, Number.isFinite(retryAt) && retryAt > Date.now() ? retryAt : Date.now() + 60_000);
        throw new ImportError('rate-limit', 'Shikimori ограничил частоту запросов. Подожди немного и повтори загрузку.');
      }
      if (response.status === 404) throw new ImportError('not-found', 'Профиль не найден или недоступен. Проверь ник.');
      if (response.status === 401 || response.status === 403) {
        throw new ImportError('forbidden', progress.stage === 'profile'
          ? 'Не удалось проверить профиль Shikimori. Попробуй позже.'
          : 'Список закрыт или недоступен без авторизации. Можно загрузить только открытый список.');
      }
      if (!response.ok) throw new ImportError('server', `Shikimori временно недоступен (HTTP ${response.status}). Повтори загрузку позже.`);
      try {
        return await response.json();
      } catch (error) {
        if (signal.aborted || !(error instanceof SyntaxError)) throw error;
        throw invalidResponse();
      }
    } catch (error) {
      if (options.signal?.aborted) throw cancelledImport();
      if (timeout.signal.aborted) throw new ImportError('timeout', 'Shikimori не ответил за 20 секунд. Повтори загрузку.');
      if (error instanceof ImportError) throw error;
      throw new ImportError('network', 'Не удалось связаться с Shikimori. Проверь соединение и повтори загрузку.');
    } finally {
      clearTimeout(timer);
      this.notBefore = Math.max(this.notBefore, Date.now() + 800);
    }
  }
}

/** Ожидает разрешённого времени запроса с немедленной отменой по сигналу. */
function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(cancelledImport());
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, milliseconds);
    /** Освобождает таймер и обработчик при отмене загрузки. */
    function abort(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(cancelledImport());
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}
