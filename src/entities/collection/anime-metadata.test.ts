import { expect, it } from 'vitest';
import { mergeAnimeMetadata } from './anime-metadata';
import { parseShikimoriExport } from '../../integrations/shikimori-json';

it('дополняет поля по ID без изменения названий, статусов и личных оценок из файла', () => {
  const source = parseShikimoriExport(JSON.stringify([
    { target_id: 1, target_type: 'Anime', target_title: 'From file', target_title_ru: 'Из файла', score: 4, status: 'dropped' },
    { target_id: 2, target_type: 'Anime', target_title: 'Second', score: 0, status: 'planned' },
    { target_id: 3, target_type: 'Anime', target_title: 'Missing', score: 7, status: 'completed' },
  ]), 'list.json');
  const before = structuredClone(source);
  const details = [2, 1].map(id => ({
    id: String(id), name: 'From API', russian: 'Название API', coverUrl: 'https://example.com/cover.jpg',
    communityScore: 8.56, url: `https://shikimori.io/animes/${id}-canonical`,
  }));
  const result = mergeAnimeMetadata(source, details);
  expect(result.entries).toEqual(source.entries);
  expect(result.profile).toEqual(source.profile);
  expect(result.animes[0]).toMatchObject({ name: 'From file', russian: 'Из файла', communityScore: 8.56, coverUrl: details[1]!.coverUrl, url: details[1]!.url });
  expect(result.animes[1]).toMatchObject({ name: 'Second', russian: 'Название API', communityScore: 8.56 });
  expect(result.animes[2]).toEqual(source.animes[2]);
  expect(source).toEqual(before);
  result.entries[0]!.originalScore = 9;
  expect(source.entries[0]!.originalScore).toBe(4);
});
