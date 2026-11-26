import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listMedia } from '../entities/collection/model';
import type { ListMedia, SourceSnapshot } from '../entities/collection/model';
import { ShikimoriSource } from './shikimori';

const profile = { id: 1, nickname: 'morr', url: 'https://shikimori.io/morr' };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('импорт Shikimori', () => {
  it('вызывает браузерный транспорт без подмены его this', async () => {
    const replies = [profile, [], page([])];
    const fetcher = vi.fn<typeof fetch>(async function(this: unknown) {
      if (this !== undefined) throw new TypeError('Illegal invocation');
      return Response.json(replies.shift());
    });
    expect((await finish(new ShikimoriSource(fetcher).load('morr'))).entries).toEqual([]);
  });

  it.each(['anime', 'manga'] as const)('читает все страницы списка %s, удаляет перекрытия и дозирует запросы без авторизации', async media => {
    const times: number[] = [];
    const replies = [profile, [], page(Array.from({ length: 50 }, (_, i) => rate(i + 1, media))), page([rate(50, media), rate(51, media)])];
    const fetcher = vi.fn<typeof fetch>(async () => {
      times.push(Date.now());
      return Response.json(replies.shift());
    });
    const result = await finish(new ShikimoriSource(fetcher).load('123', { media }));
    expect(listMedia(result)).toBe(media);
    expect(result.entries).toHaveLength(51);
    expect(new Set(result.entries.map(entry => entry.animeId)).size).toBe(51);
    expect(result.entries[0]!.originalScore).toBeNull();
    expect(result.animes[0]).toMatchObject({
      communityScore: 8.76, kind: media === 'manga' ? 'light_novel' : 'tv',
      url: `https://shikimori.io/${media === 'manga' ? 'ranobe' : 'animes'}/1`,
      coverUrl: 'https://shikimori.io/posters/1.jpg',
    });
    expect(result.animes[1]!.coverUrl).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(String(fetcher.mock.calls[0]![0])).toContain('/123?is_nickname=1');
    expect(String(fetcher.mock.calls[1]![0])).toContain(`/api/users/1/${media}_rates?`);
    expect(JSON.parse(fetcher.mock.calls[3]![1]!.body as string).query).toContain('page: 2');
    const listQuery = JSON.parse(fetcher.mock.calls[2]![1]!.body as string).query as string;
    expect(listQuery).toContain(`targetType: ${media === 'manga' ? 'Manga' : 'Anime'}`);
    expect(listQuery).toContain(`${media} { id name russian url score kind poster { mainUrl } }`);
    for (const [, init] of fetcher.mock.calls) {
      expect(init!.credentials).toBe('omit');
      expect(new Headers(init!.headers).has('Authorization')).toBe(false);
    }
    for (let i = 1; i < times.length; i += 1) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(800);
  });

  it('возвращает пустую коллекцию, если открытый список пуст', async () => {
    const fetcher = sequence(profile, [], page([]));
    expect((await finish(new ShikimoriSource(fetcher).load('morr'))).entries).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('останавливается после отсутствующего профиля, не запрашивая список', async () => {
    const fetcher = sequence(new Response('', { status: 404 }));
    await failure(new ShikimoriSource(fetcher).load('missing'), 'not-found');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('проверяет ник одним запросом профиля без запроса списка', async () => {
    const fetcher = sequence(profile);
    expect(await finish(new ShikimoriSource(fetcher).lookupProfile(' morr '))).toMatchObject({ id: '1', nickname: 'morr' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]![0])).toBe('https://shikimori.io/api/users/morr?is_nickname=1');
  });

  it.each([401, 403])('не обращается к GraphQL после отказа REST %s', async status => {
    const fetcher = sequence(profile, new Response('Forbidden', { status }));
    await failure(new ShikimoriSource(fetcher).load('morr'), 'forbidden');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('не принимает HTTP 200 с ошибками GraphQL за завершённый импорт', async () => {
    const fetcher = sequence(profile, [], { data: { userRates: [] }, errors: [{ message: 'Partial' }] });
    await failure(new ShikimoriSource(fetcher).load('morr'), 'response');
  });

  it('отклоняет повторяющиеся полные страницы вместо бесконечной загрузки', async () => {
    const full = page(Array.from({ length: 50 }, (_, i) => rate(i + 1)));
    const fetcher = sequence(profile, [], full, full);
    await failure(new ShikimoriSource(fetcher).load('morr'), 'response');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('после сетевого отказа позволяет повторить загрузку', async () => {
    const fetcher = sequence(profile, [], page([]));
    fetcher.mockRejectedValueOnce(new TypeError('Network failed'));
    const source = new ShikimoriSource(fetcher);
    await failure(source.load('morr'), 'network');
    expect((await finish(source.load('morr'))).profile.id).toBe('1');
  });

  it('отменяет ожидание следующего запроса, не запуская его', async () => {
    const fetcher = sequence(profile, [], page([]));
    const controller = new AbortController();
    const pending = new ShikimoriSource(fetcher).load('morr', { signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('после 429 выдерживает Retry-After перед ручным повтором', async () => {
    const fetcher = sequence(new Response('', { status: 429, headers: { 'Retry-After': '2' } }), profile, [], page([]));
    const source = new ShikimoriSource(fetcher);
    const rejected = expect(source.load('morr')).rejects.toMatchObject({ code: 'rate-limit' });
    await vi.advanceTimersByTimeAsync(0);
    await rejected;
    const pending = source.load('morr');
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await finish(pending)).entries).toEqual([]);
  });

  it('различает тайм-аут и HTML вместо ожидаемого JSON', async () => {
    const fetcher = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Timeout', 'AbortError')), { once: true });
    }));
    await failure(new ShikimoriSource(fetcher).load('morr'), 'timeout');
    await failure(new ShikimoriSource(sequence(new Response('<html>Challenge</html>'))).load('morr'), 'response');
  });
});

/** Создаёт ответ GraphQL с указанными пользовательскими записями. */
function page(rates: unknown[]): unknown {
  return { data: { userRates: rates } };
}

/** Возвращает запись списка и метаданные первого произведения. */
function rate(id: number, media: ListMedia = 'anime'): unknown {
  const metadata = id === 1
    ? { score: 8.76, kind: media === 'manga' ? 'light_novel' : 'tv', poster: { mainUrl: '/posters/1.jpg' } }
    : { poster: null };
  const catalog = media === 'manga' && id === 1 ? 'ranobe' : `${media}s`;
  return {
    id: String(1000 + id), score: id === 1 ? 0 : 8, status: 'completed',
    [media]: { id: String(id), name: `Title ${id}`, russian: null, url: `/${catalog}/${id}`, ...metadata },
  };
}

/** Выдаёт последовательность управляемых ответов вместо обращений к действующему API. */
function sequence(...replies: unknown[]) {
  return vi.fn<typeof fetch>(async () => {
    const reply = replies.shift();
    return reply instanceof Response ? reply : Response.json(reply);
  });
}

/** Завершает загрузку с управляемым временем без реальных сетевых ожиданий. */
async function finish<T>(pending: Promise<T>): Promise<T> {
  const captured = pending.then(value => ({ value }), error => ({ error }));
  await vi.runAllTimersAsync();
  const result = await captured;
  if ('error' in result) throw result.error;
  return result.value;
}

/** Проверяет отказ, заранее подключая обработчик отклонения Promise. */
async function failure(pending: Promise<SourceSnapshot>, code: string): Promise<void> {
  const assertion = expect(pending).rejects.toMatchObject({ code });
  await vi.runAllTimersAsync();
  await assertion;
}
