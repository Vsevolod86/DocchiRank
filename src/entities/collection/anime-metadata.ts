import type { Work, SourceSnapshot } from './model';

/** Дополняет снимок публичными полями по ID, сохраняя названия, статусы и оценки из файла. */
export function mergeAnimeMetadata(source: SourceSnapshot, metadata: readonly Work[]): SourceSnapshot {
  const byId = new Map(metadata.map(anime => [anime.id, anime]));
  const result = structuredClone(source);
  result.animes = result.animes.map(anime => {
    const details = byId.get(anime.id);
    return details ? {
      ...anime, name: source.profile.source === 'saved-selection' ? details.name : anime.name,
      russian: anime.russian ?? details.russian, coverUrl: details.coverUrl,
      communityScore: details.communityScore, kind: details.kind ?? anime.kind ?? null, url: details.url,
    } : anime;
  });
  return result;
}
