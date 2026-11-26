import { describe, expect, it } from 'vitest';
import { ImportError, parseProfileInput, parseRatesPage } from './shikimori-data';

describe('ввод профиля', () => {
  it.each([
    [' 123 ', '123'], ['reader.86', 'reader.86'],
    ['https://shikimori.io/morr/?section=stats', 'morr'],
    ['shikimori.io/Name+With+Spaces', 'Name With Spaces'],
    ['https://shikimori.io/%D0%9D%D0%B8%D0%BA', 'Ник'],
  ])('нормализует %s', (input, expected) => {
    expect(parseProfileInput(input)).toBe(expected);
  });

  it.each(['', 'https://example.com/morr', 'https://shikimori.io/morr/animes', 'https://shikimori.io/a%2Fb', 'https://shikimori.io/%ZZ', 'https://user:password@shikimori.io/morr', 'a\nb',
    'https://shikimori.one/morr', 'https://shikimori.me/morr', 'shikimori.org/morr'])('отклоняет неверный ввод %s', input => {
    expect(() => parseProfileInput(input)).toThrow(ImportError);
  });
});

describe('ответы списка', () => {
  it('получает тип произведения из GraphQL и отклоняет неподдерживаемое значение', () => {
    const rate = { id: '1001', score: 8, status: 'completed', anime: { id: '1', name: 'Anime', url: '/animes/1', kind: 'movie' } };
    expect(parseRatesPage({ data: { userRates: [rate] } }, 'time')[0]!.anime.kind).toBe('movie');
    rate.anime.kind = 'book';
    expect(() => parseRatesPage({ data: { userRates: [rate] } }, 'time')).toThrow(ImportError);
  });

  it('разделяет ID записи и аниме, отсутствие оценки, перевод и относительные URL', () => {
    const [result] = parseRatesPage({ data: { userRates: [{
      id: '1001', score: 0, status: 'planned',
      anime: { id: '1', name: 'Anime', russian: '', url: '/animes/1', poster: { mainUrl: '/uploads/poster.webp' } },
    }] } }, 'import-time');
    expect(result).toEqual({
      anime: { id: '1', name: 'Anime', russian: null, url: 'https://shikimori.io/animes/1', coverUrl: 'https://shikimori.io/uploads/poster.webp', communityScore: null, kind: null },
      entry: { id: '1001', animeId: '1', originalScore: null, status: 'planned', importedAt: 'import-time' },
    });
  });

  it('хранит дробную оценку сообщества отдельно от пользовательской и не округляет её', () => {
    const [result] = parseRatesPage({ data: { userRates: [{
      id: '1001', score: 7, status: 'completed',
      anime: { id: '1', name: 'Anime', url: '/animes/1', score: 8.76 },
    }] } }, 'time');
    expect(result!.anime.communityScore).toBe(8.76);
    expect(result!.entry.originalScore).toBe(7);
  });

  it.each([null, undefined, 0])('допускает отсутствие оценки сообщества: %s', score => {
    const [result] = parseRatesPage({ data: { userRates: [{
      id: '1001', score: 9, status: 'completed',
      anime: { id: '1', name: 'Anime', url: '/animes/1', score },
    }] } }, 'time');
    expect(result!.anime.communityScore).toBeNull();
    expect(result!.entry.originalScore).toBe(9);
  });

  it.each([-1, 11, '8.76', NaN, Infinity])('отклоняет неверную оценку сообщества: %s', score => {
    expect(() => parseRatesPage({ data: { userRates: [{
      id: '1001', score: 9, status: 'completed',
      anime: { id: '1', name: 'Anime', url: '/animes/1', score },
    }] } }, 'time')).toThrow(ImportError);
  });

  it('отличает пустой список от частичного ответа GraphQL и неверной формы JSON', () => {
    expect(parseRatesPage({ data: { userRates: [] } }, 'time')).toEqual([]);
    expect(() => parseRatesPage({ data: { userRates: [] }, errors: [{ message: 'Partial' }] }, 'time')).toThrow(ImportError);
    expect(() => parseRatesPage({ data: null }, 'time')).toThrow(ImportError);
  });

  it.each([
    { score: 11 }, { score: '8' }, { status: 'unknown' },
    { anime: { id: '1', name: 'Anime', url: 'javascript:alert(1)', poster: null } },
  ])('отклоняет повреждённые значения, а не подменяет их данными', fields => {
    const rate = { id: '1001', score: 8, status: 'completed', anime: { id: '1', name: 'Anime', russian: null, url: '/animes/1', poster: null }, ...fields };
    expect(() => parseRatesPage({ data: { userRates: [rate] } }, 'time')).toThrow(ImportError);
  });
});
