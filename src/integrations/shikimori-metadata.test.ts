import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHIKIMORI_REQUESTS } from '../config/shikimori';
import type { SourceSnapshot } from '../entities/collection/model';
import { ShikimoriSource } from './shikimori';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('публичные сведения для JSON-списка', () => {
  it.each(['anime', 'manga'] as const)('получает пакетами каталог %s только по ID, без чтения профиля и авторизации', async media => {
    const source = snapshot(51);
    if (media === 'manga') source.media = media;
    const catalog = `${media}s`;
    const before = structuredClone(source);
    const times: number[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      times.push(Date.now());
      const ids = (JSON.parse(init!.body as string).variables.ids as string).split(',');
      const works = ids.reverse().map(id => ({ ...anime(id), url: `/${catalog}/${id}` }));
      return Response.json({ data: { [catalog]: works } });
    });
    const pending = new ShikimoriSource(fetcher).enrich(source);
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.matched).toBe(51);
    expect(result.error).toBeNull();
    expect(result.snapshot.entries).toEqual(source.entries);
    expect(result.snapshot.animes[0]).toMatchObject({ id: '1', name: 'From file', communityScore: 8.56,
      url: `https://shikimori.io/${catalog}/1`, coverUrl: 'https://example.com/1.jpg' });
    expect(source).toEqual(before);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(800);
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).toBe('https://shikimori.io/api/graphql');
      expect(init!.credentials).toBe('omit');
      expect(new Headers(init!.headers).has('Authorization')).toBe(false);
      const body = JSON.parse(init!.body as string);
      expect(body.query).toContain(`${catalog}(ids: $ids`);
      expect(body.variables.ids.split(',').length).toBeLessThanOrEqual(50);
      expect(body.query).toContain('score kind poster { mainUrl }');
      expect(body.query).not.toContain('userRates');
    }
  });

  it('сохраняет записи, для которых нет публичных сведений, и не требует сети для пустого списка', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: { animes: [anime('2')] } }));
    const source = new ShikimoriSource(fetcher);
    const result = await source.enrich(snapshot(2));
    expect(result.matched).toBe(1);
    expect(result.snapshot.animes[0]).toEqual(snapshot(2).animes[0]);
    expect(result.snapshot.entries).toHaveLength(2);
    expect((await source.enrich(snapshot(0))).matched).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('отклоняет нулевой размер пакета до запроса', async () => {
    const { metadataBatchSize } = SHIKIMORI_REQUESTS;
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('Неожиданный запрос.'));
    Object.assign(SHIKIMORI_REQUESTS, { metadataBatchSize: 0 });
    try {
      const result = await new ShikimoriSource(fetcher).enrich(snapshot(1));
      expect(result.error).toMatchObject({ code: 'input' });
      expect(result.snapshot).toEqual(snapshot(1));
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      Object.assign(SHIKIMORI_REQUESTS, { metadataBatchSize });
    }
  });

  it('при сетевом отказе сохраняет завершённые пакеты и позволяет повторить загрузку', async () => {
    let calls = 0;
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      calls += 1;
      if (calls === 2) throw new TypeError('offline');
      const ids = (JSON.parse(init!.body as string).variables.ids as string).split(',');
      return Response.json({ data: { animes: ids.map(anime) } });
    });
    const source = new ShikimoriSource(fetcher);
    const pending = source.enrich(snapshot(51));
    await vi.runAllTimersAsync();
    const partial = await pending;
    expect(partial.error).toMatchObject({ code: 'network' });
    expect(partial.matched).toBe(50);
    expect(partial.snapshot.entries).toHaveLength(51);
    expect(partial.snapshot.animes[0]!.communityScore).toBe(8.56);
    expect(partial.snapshot.animes[50]!.communityScore).toBeNull();
    const retry = source.enrich(partial.snapshot);
    await vi.runAllTimersAsync();
    expect((await retry).matched).toBe(51);
  });

  it('отмена останавливает следующий пакет и сохраняет полученные сведения', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const ids = (JSON.parse(init!.body as string).variables.ids as string).split(',');
      return Response.json({ data: { animes: ids.map(anime) } });
    });
    const pending = new ShikimoriSource(fetcher).enrich(snapshot(51), {
      signal: controller.signal,
      onProgress: progress => { if (progress.loaded === 50) controller.abort(); },
    });
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.error).toMatchObject({ code: 'cancelled' });
    expect(result.matched).toBe(50);
    expect(result.snapshot.entries).toHaveLength(51);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    { data: { animes: [anime('3')] } },
    { data: { animes: [anime('1'), anime('1')] } },
    { data: { animes: [anime('1')] }, errors: [{ message: 'Partial' }] },
    { data: { animes: [{ ...anime('1'), score: 'bad' }] } },
  ])('не применяет чужие ID, дубликаты и повреждённые или частичные пакеты', async response => {
    const result = await new ShikimoriSource(async () => Response.json(response)).enrich(snapshot(2));
    expect(result.error).toMatchObject({ code: 'response' });
    expect(result.matched).toBe(0);
    expect(result.snapshot).toEqual(snapshot(2));
  });
});

/** Создаёт независимый файловый список с личными оценками, отличными от рейтинга сообщества. */
function snapshot(count: number): SourceSnapshot {
  return {
    profile: { id: 'list.json', nickname: 'List', source: 'shikimori-json', url: null },
    animes: Array.from({ length: count }, (_, index) => ({ id: String(index + 1), name: 'From file', russian: null, coverUrl: null, communityScore: null, url: `https://shikimori.io/animes/${index + 1}` })),
    entries: Array.from({ length: count }, (_, index) => ({ id: `json:${index + 1}`, animeId: String(index + 1), status: 'completed', originalScore: 4, importedAt: 'time' })),
  };
}

/** Возвращает публичные метаданные с дробной оценкой и обложкой. */
function anime(id: string) {
  return { id, name: 'From API', russian: 'Название API', url: `https://shikimori.io/animes/${id}`, score: 8.56, poster: { mainUrl: `https://example.com/${id}.jpg` } };
}
