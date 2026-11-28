import { SHIKIMORI_REQUESTS } from '../config/shikimori';
import type { ListEntry, ListMedia, ListStatus, Profile, SourceSnapshot, Work } from '../entities/collection/model';
import { isWorkKind, LIST_STATUSES } from '../entities/collection/model';
import type { ImportOptions } from './list-source';

export const SHIKIMORI_ORIGIN = 'https://shikimori.io';
export const SHIKIMORI_TARGET_TYPE = { anime: 'Anime', manga: 'Manga' } as const;
const profileHost = new URL(SHIKIMORI_ORIGIN).hostname;

export type ImportErrorCode = 'input' | 'not-found' | 'forbidden' | 'rate-limit' | 'network' | 'timeout' | 'response' | 'cancelled' | 'server';

/** Ошибка импорта с понятным сообщением и кодом для обработки без анализа текста. */
export class ImportError extends Error {
  /** Сохраняет машинный код ошибки отдельно от отображаемого пользователю сообщения. */
  constructor(public readonly code: ImportErrorCode, message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Извлекает ник из строки или адреса страницы профиля на shikimori.io. */
export function parseProfileInput(input: string): string {
  let nickname = input.trim();
  if (nickname.toLowerCase().startsWith(profileHost + '/')) nickname = `https://${nickname}`;
  if (/^https?:\/\//i.test(nickname)) {
    try {
      const url = new URL(nickname);
      if (url.hostname !== profileHost || url.port || url.username || url.password || !/^\/[^/]+\/?$/.test(url.pathname)) {
        throw new Error();
      }
      nickname = decodeURIComponent(url.pathname.replace(/^\/|\/$/g, '')).replaceAll('+', ' ');
    } catch {
      throw new ImportError('input', 'Укажи ник или ссылку вида https://shikimori.io/ник.');
    }
  }
  if (!nickname || /[/?#\\\u0000-\u001f\u007f]/.test(nickname)) {
    throw new ImportError('input', 'Укажи ник или ссылку на профиль Shikimori.');
  }
  return nickname;
}

/** Проверяет обязательные поля профиля на публичной границе API. */
export function parseProfile(value: unknown): Profile {
  const profile = record(value);
  return {
    id: identifier(profile.id), nickname: text(profile.nickname),
    url: httpsUrl(profile.url), source: 'shikimori',
  };
}

/** Собирает страницы одного профиля и публикует снимок только после загрузки всего списка. */
export async function collectShikimoriList(
  readPage: (page: number, loaded: number) => Promise<{ profile: Profile; result: unknown }>,
  options: ImportOptions,
  media: ListMedia = 'anime',
): Promise<SourceSnapshot> {
  const byWork = new Map<string, ReturnType<typeof parseRatesPage>[number]>();
  const rateOwners = new Map<string, string>();
  const importedAt = new Date().toISOString();
  let profile: Profile | undefined;
  for (let page = 1; ; page += 1) {
    const response = await readPage(page, byWork.size);
    if (profile && profile.id !== response.profile.id) throw invalidResponse();
    profile = response.profile;
    const rates = parseRatesPage(response.result, importedAt, media);
    const previousSize = byWork.size;
    for (const rate of rates) {
      const owner = rateOwners.get(rate.entry.id);
      if (owner && owner !== rate.anime.id) throw invalidResponse();
      rateOwners.set(rate.entry.id, rate.anime.id);
      byWork.set(rate.anime.id, rate);
    }
    options.onProgress?.({ stage: 'entries', loaded: byWork.size });
    if (rates.length < SHIKIMORI_REQUESTS.listPageSize) break;
    if (byWork.size === previousSize) {
      throw new ImportError('response', 'Shikimori повторяет одну страницу списка. Повтори загрузку позже.');
    }
  }
  if (options.signal?.aborted) throw cancelledImport();
  return { profile, ...(media === 'manga' ? { media } : {}),
    animes: Array.from(byWork.values(), rate => rate.anime), entries: Array.from(byWork.values(), rate => rate.entry) };
}

/** Создаёт отличимую от сетевого сбоя ошибку пользовательской отмены. */
export function cancelledImport(): ImportError {
  return new ImportError('cancelled', 'Загрузка отменена.');
}

/** Проверяет страницу, сохраняя пользовательскую и дробную общую оценку отдельно. */
export function parseRatesPage(value: unknown, importedAt: string, media: ListMedia = 'anime'): { anime: Work; entry: ListEntry }[] {
  const response = record(value);
  if (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length > 0)) {
    throw new ImportError('response', 'Shikimori не смог полностью вернуть список. Повтори загрузку.');
  }
  const rates = record(response.data).userRates;
  if (!Array.isArray(rates) || rates.length > SHIKIMORI_REQUESTS.listPageSize) throw invalidResponse();
  return rates.map(value => {
    const rate = record(value);
    const score = rate.score;
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 10 || !isListStatus(rate.status)) {
      throw invalidResponse();
    }
    const anime = parseWork(rate[media], media);
    return {
      anime,
      entry: {
        id: identifier(rate.id), animeId: anime.id, status: rate.status,
        originalScore: score === 0 ? null : score as ListEntry['originalScore'], importedAt,
      },
    };
  });
}

/** Проверяет публичный пакет произведений, отклоняя частичный ответ GraphQL и неверную форму. */
export function parseWorkPage(value: unknown, media: ListMedia): Work[] {
  const response = record(value);
  if (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length > 0)) throw invalidResponse();
  const works = record(response.data)[`${media}s`];
  if (!Array.isArray(works) || works.length > SHIKIMORI_REQUESTS.metadataBatchSize) throw invalidResponse();
  return works.map(work => parseWork(work, media));
}

/** Проверяет принадлежность значения согласованным статусам списка. */
export function isListStatus(value: unknown): value is ListStatus {
  return LIST_STATUSES.some(status => value === status);
}

/** Создаёт ошибку неполного или неожиданного ответа без раскрытия его содержимого. */
export function invalidResponse(): ImportError {
  return new ImportError('response', 'Shikimori вернул неожиданный ответ. Попробуй загрузить список ещё раз.');
}

/** Проверяет общие поля произведения в списке профиля и публичном каталоге. */
function parseWork(value: unknown, media: ListMedia): Work {
  const work = record(value);
  const { score: communityScore, kind = null } = work;
  if (kind !== null && !isWorkKind(kind, media)) throw invalidResponse();
  if (communityScore !== null && communityScore !== undefined
    && (typeof communityScore !== 'number' || !Number.isFinite(communityScore) || communityScore < 0 || communityScore > 10)) {
    throw invalidResponse();
  }
  const poster = work.poster === null || work.poster === undefined ? null : record(work.poster);
  return {
    id: identifier(work.id), name: text(work.name), russian: optionalText(work.russian),
    url: httpsUrl(work.url), coverUrl: poster?.mainUrl ? httpsUrl(poster.mainUrl) : null,
    communityScore: communityScore === undefined || communityScore === null || communityScore === 0 ? null : communityScore as number,
    kind,
  };
}

/** Проверяет объект JSON перед чтением его полей. */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidResponse();
  return value as Record<string, unknown>;
}

/** Нормализует положительный ID, не округляя строковые значения GraphQL. */
function identifier(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value;
  throw invalidResponse();
}

/** Проверяет непустую строку обязательного поля. */
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw invalidResponse();
  return value.trim();
}

/** Преобразует отсутствие перевода или пустую строку в null. */
function optionalText(value: unknown): string | null {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  return text(value);
}

/** Разрешает относительный URL и запрещает исполняемые или незащищённые схемы. */
function httpsUrl(value: unknown): string {
  try {
    const url = new URL(text(value), SHIKIMORI_ORIGIN);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    return url.href;
  } catch {
    throw invalidResponse();
  }
}
