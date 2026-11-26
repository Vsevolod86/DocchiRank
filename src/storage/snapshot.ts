import { isWorkKind, LIST_STATUSES } from '../entities/collection/model';
import type { SourceSnapshot } from '../entities/collection/model';

/** Копирует текстовые поля снимка, оставляя только сетевые ссылки на изображения. */
export function cacheSnapshot(source: SourceSnapshot): SourceSnapshot {
  const { id, nickname, url, source: origin } = source.profile;
  return {
    ...(source.media === undefined ? {} : { media: source.media }),
    profile: { id, nickname, url, source: origin },
    animes: source.animes.map(anime => ({
      id: anime.id, name: anime.name, russian: anime.russian, url: anime.url,
      communityScore: anime.communityScore, kind: anime.kind ?? null, coverUrl: httpUrl(anime.coverUrl) ? anime.coverUrl : null,
    })),
    entries: source.entries.map(entry => ({
      id: entry.id, animeId: entry.animeId, status: entry.status,
      originalScore: entry.originalScore, importedAt: entry.importedAt,
    })),
  };
}

/** Проверяет поля исходного списка перед восстановлением коллекции. */
export function validSnapshot(value: unknown): value is SourceSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { profile, animes, entries, media } = value as SourceSnapshot;
  return (media === undefined || media === 'anime' || media === 'manga')
    && !!profile && typeof profile.id === 'string' && !!profile.id.trim()
    && typeof profile.nickname === 'string' && !!profile.nickname.trim()
    && ['shikimori', 'shikimori-json', 'saved-selection', 'demo'].includes(profile.source)
    && (profile.url === null || httpUrl(profile.url))
    && Array.isArray(animes) && animes.every(anime => anime && typeof anime.id === 'string' && /^[1-9]\d*$/.test(anime.id)
      && typeof anime.name === 'string' && !!anime.name.trim() && (anime.russian === null || typeof anime.russian === 'string')
      && httpUrl(anime.url) && (anime.coverUrl === null || httpUrl(anime.coverUrl))
      && (anime.kind === null || isWorkKind(anime.kind, media ?? 'anime'))
      && (anime.communityScore === null || typeof anime.communityScore === 'number' && Number.isFinite(anime.communityScore) && anime.communityScore >= 0 && anime.communityScore <= 10))
    && Array.isArray(entries) && entries.every(entry => entry && typeof entry.id === 'string' && !!entry.id.trim()
      && typeof entry.animeId === 'string' && (entry.status === null || LIST_STATUSES.includes(entry.status))
      && (entry.originalScore === null || Number.isInteger(entry.originalScore) && entry.originalScore >= 1 && entry.originalScore <= 10)
      && typeof entry.importedAt === 'string' && Number.isFinite(Date.parse(entry.importedAt)));
}

/** Принимает обычные HTTP(S)-ссылки и отклоняет встроенные или выполняемые URL. */
function httpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
