import { LIST_STATUSES } from '../../entities/collection/model';
import type { ListEntry, SourceSnapshot } from '../../entities/collection/model';

export const LIST_SORTS = [
  { key: 'my-score', label: 'Моя оценка' },
  { key: 'community-score', label: 'Оценка Shikimori' },
  { key: 'alphabet', label: 'Алфавит' },
  { key: 'status', label: 'Статус' },
] as const;

/** Порядок карточек, независимый от установленного порядка попарного сравнения. */
export interface ListSort {
  key: typeof LIST_SORTS[number]['key'];
  reversed: boolean;
}

const alphabet = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

/** Сортирует копию записей; пустые оценки всегда в конце, равные ключи — по алфавиту. */
export function sortEntries(source: Pick<SourceSnapshot, 'animes'>, entries: readonly ListEntry[], sort: ListSort): ListEntry[] {
  const animes = new Map(source.animes.map(anime => [anime.id, anime]));
  const direction = sort.reversed ? -1 : 1;
  return [...entries].sort((left, right) => {
    const leftAnime = animes.get(left.animeId)!;
    const rightAnime = animes.get(right.animeId)!;
    const byName = alphabet.compare(leftAnime.russian || leftAnime.name, rightAnime.russian || rightAnime.name);
    if (sort.key === 'alphabet') return byName * direction;
    if (sort.key === 'status') {
      if (left.status === null || right.status === null) {
        return left.status === right.status ? byName : left.status === null ? 1 : -1;
      }
      return (LIST_STATUSES.indexOf(left.status) - LIST_STATUSES.indexOf(right.status)) * direction || byName;
    }
    const leftScore = sort.key === 'my-score' ? left.originalScore : leftAnime.communityScore;
    const rightScore = sort.key === 'my-score' ? right.originalScore : rightAnime.communityScore;
    if (leftScore === null || rightScore === null) {
      return leftScore === rightScore ? byName : leftScore === null ? 1 : -1;
    }
    return (rightScore - leftScore) * direction || byName;
  });
}
