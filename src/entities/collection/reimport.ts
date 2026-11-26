import { validateSourceSnapshot } from './collection';
import type { Collection, SourceSnapshot } from './model';
import { listMedia } from './model';

/** Обновляет профиль и исходный список, сохраняя пользовательское имя коллекции и её прогресс. */
export function mergeImportedList(existing: Collection, incoming: SourceSnapshot): Collection {
  if (existing.profile.source !== incoming.profile.source || existing.profile.id !== incoming.profile.id) {
    throw new Error('Нельзя объединить списки разных профилей.');
  }
  if (listMedia(existing) !== listMedia(incoming)) throw new Error('Нельзя объединить списки из разных каталогов Shikimori.');
  validateSourceSnapshot(incoming);
  const result = structuredClone(existing);
  const animes = new Map(result.animes.map(anime => [anime.id, anime]));
  const entries = new Map(result.entries.map(entry => [entry.animeId, entry]));
  for (const anime of incoming.animes) animes.set(anime.id, structuredClone(anime));
  for (const entry of incoming.entries) entries.set(entry.animeId, structuredClone(entry));
  result.profile = structuredClone(incoming.profile);
  if (existing.name === existing.profile.nickname) result.name = incoming.profile.nickname;
  result.animes = [...animes.values()];
  result.entries = [...entries.values()];
  validateSourceSnapshot(result);
  return result;
}
