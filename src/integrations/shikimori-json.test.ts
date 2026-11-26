import { describe, expect, it } from 'vitest';
import { createCollection } from '../entities/collection/collection';
import { LIST_STATUSES } from '../entities/collection/model';
import { mergeImportedList } from '../entities/collection/reimport';
import { ImportError } from './shikimori-data';
import { parseShikimoriExport, updateShikimoriExport } from './shikimori-json';

describe('JSON-выгрузка Shikimori', () => {
  it('читает названия, статусы и личные оценки без подстановки обложек или общего рейтинга', () => {
    const source = parseShikimoriExport(JSON.stringify([row()]), 'reader.86_animes.json', 'import-time');
    expect(source.profile).toEqual({ id: 'reader.86_animes.json', nickname: 'reader.86', url: null, source: 'shikimori-json' });
    expect(source.animes).toEqual([{
      id: '35790', name: 'Tate no Yuusha no Nariagari', russian: 'Восхождение героя щита',
      url: 'https://shikimori.io/animes/35790', coverUrl: null, communityScore: null,
    }]);
    expect(source.entries).toEqual([{
      id: 'json:35790', animeId: '35790', originalScore: 7, status: 'completed', importedAt: 'import-time',
    }]);
  });

  it('поддерживает BOM, пустой список, нулевую оценку и отсутствие перевода', () => {
    expect(parseShikimoriExport('\uFEFF[]', 'empty.json').entries).toEqual([]);
    const source = parseShikimoriExport(JSON.stringify([{ ...row(), target_id: '35790', score: 0, target_title_ru: null }]), 'list.JSON');
    expect(source.entries[0]!.originalScore).toBeNull();
    expect(source.animes[0]!.russian).toBeNull();
    expect(parseShikimoriExport(JSON.stringify([{ ...row(), target_title_ru: '' }]), 'list.json').animes[0]!.russian).toBeNull();
  });

  it('поддерживает все статусы и крайние оценки без потери записей', () => {
    const rows = LIST_STATUSES.map((status, index) => ({ ...row(), target_id: index + 1, score: index % 2 ? 10 : 1, status }));
    const source = parseShikimoriExport(JSON.stringify(rows), 'list.json');
    expect(source.entries.map(entry => entry.status)).toEqual(LIST_STATUSES);
    expect(source.entries.map(entry => entry.originalScore)).toEqual([1, 10, 1, 10, 1, 10]);
    expect(source.animes).toHaveLength(rows.length);
  });

  it.each(['{', '{}', 'null', '{"schemaVersion":1,"collections":[]}'])('отклоняет повреждённый JSON и другой формат: %s', contents => {
    expect(() => parseShikimoriExport(contents, 'list.json')).toThrow(ImportError);
  });

  it.each([
    null, { ...row(), target_type: 'Manga' }, { ...row(), target_id: -1 }, { ...row(), target_id: 1.5 },
    { ...row(), target_id: Number.MAX_SAFE_INTEGER + 1 }, { ...row(), score: 11 }, { ...row(), score: '7' },
    { ...row(), status: 'unknown' }, { ...row(), target_title: '' }, { ...row(), target_title_ru: 1 },
  ])('отклоняет неверную запись целиком вместо частичного импорта: %j', value => {
    expect(() => parseShikimoriExport(JSON.stringify([row(), value]), 'list.json')).toThrow(ImportError);
  });

  it('отклоняет повторный ID, чтобы не объединять противоречащие записи', () => {
    expect(() => parseShikimoriExport(JSON.stringify([row(), { ...row(), score: 9 }]), 'list.json')).toThrow(/повторяется ID/);
  });

  it('обновляет тот же файл по стабильным ID, сохраняя выбор и порядок', () => {
    const source = parseShikimoriExport(JSON.stringify([row()]), 'list.json');
    const collection = createCollection(source, ['35790'], 'file-collection');
    collection.orderedIds = ['35790'];
    const updated = parseShikimoriExport(JSON.stringify([{ ...row(), score: 9 }, { ...row(), target_id: 1 }]), 'list.json');
    const merged = mergeImportedList(collection, updated);
    expect(merged.selectedIds).toEqual(['35790']);
    expect(merged.orderedIds).toEqual(['35790']);
    expect(merged.entries).toHaveLength(2);
    expect(merged.entries[0]!.originalScore).toBe(9);
    expect(collection.entries[0]!.originalScore).toBe(7);
  });

  it.each(['anime', 'manga'] as const)('меняет только score в списке %s и добавляет отсутствующий тайтл в конец', media => {
    const targetType = media === 'manga' ? 'Manga' : 'Anime';
    const rows = [
      { ...row(), target_id: '35790', extra: { nested: [null, 'Примечание'] }, text: 'Заметка к аниме' },
      { ...row(), target_id: 1, score: 0, status: 'planned', text: null },
      { ...row(), target_id: 2, score: 7, status: 'rewatching', rewatches: 3 },
      { ...row(), target_id: 3, score: 9, status: 'watching', episodes: 2 },
    ].map(({ episodes, ...entry }) => ({ ...entry, target_type: targetType,
      ...(media === 'manga' ? { chapters: episodes, volumes: 8 } : { episodes }) }));
    const work = { id: '999', name: 'New title', russian: 'Новое произведение' };
    const grades = new Map([['35790', 10], ['2', 7], ['999', 8]] as const);
    const { text, updated, added } = updateShikimoriExport(JSON.stringify(rows), grades, [work], media);
    const expected = { target_id: 999, target_title: work.name, target_title_ru: work.russian, target_type: targetType,
      score: 8, status: 'planned', ...(media === 'manga' ? { chapters: 0, volumes: 0 } : { episodes: 0 }), rewatches: 0, text: null };
    expect(JSON.parse(text)).toEqual([{ ...rows[0], score: 10 }, ...rows.slice(1), expected]);
    expect(updated).toBe(1);
    expect(added).toEqual([expected]);
    expect(JSON.parse(updateShikimoriExport('[]', new Map([['999', 8]]), [work], media).text)).toEqual([expected]);
    expect(() => updateShikimoriExport(text, grades, [work], media === 'manga' ? 'anime' : 'manga')).toThrow(/Выбери выгрузку для списка/);
  });
});

/** Повторяет поля штатной выгрузки, включая неиспользуемые заметку и прогресс просмотра. */
function row() {
  return {
    target_title: 'Tate no Yuusha no Nariagari', target_title_ru: 'Восхождение героя щита', target_id: 35790,
    target_type: 'Anime', score: 7, status: 'completed', rewatches: 1, episodes: 25, text: '',
  };
}
