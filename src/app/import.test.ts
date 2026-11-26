// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIST_FIXTURE } from './list-fixture';
import type { SourceSnapshot } from '../entities/collection/model';
import { createCollection } from '../entities/collection/collection';
import { parseCollectionBackup, serializeCollectionBackup } from '../storage/collection-backup';
import type { ListMetadataSource } from '../integrations/list-source';
import { demoSource } from '../integrations/demo';
import { ImportError } from '../integrations/shikimori-data';
import { BrowserSelectionStore } from '../storage/selection-store';
import { MemoryCollectionStore } from '../storage/collection-store';
import { mountApp } from './mount-app';

let root: HTMLElement;
let selections: BrowserSelectionStore;
let store: MemoryCollectionStore;
let source: ListMetadataSource;

beforeEach(() => {
  const values = new Map<string, string>();
  selections = new BrowserSelectionStore({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } });
  source = {
    load: vi.fn(async () => profileSnapshot()),
    lookupProfile: vi.fn(async () => profileSnapshot().profile),
    enrich: vi.fn(async snapshot => ({ snapshot, matched: snapshot.entries.length, error: null })),
  };
  startApp();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('карточки импорта и восстановление выбора', () => {
  it('сразу открывает набор и показывает прогресс, применяя данные только после полной загрузки', async () => {
    selectImportMethod('profile');
    let complete!: (snapshot: SourceSnapshot) => void;
    let progress: Parameters<ListMetadataSource['load']>[1];
    vi.mocked(source.load).mockImplementation((_input, options) => {
      progress = options;
      return new Promise(resolve => { complete = resolve; });
    });
    root.querySelector<HTMLInputElement>('#profile-input')!.value = 'https://shikimori.io/public-user/?section=stats#profile';
    root.querySelector<HTMLFormElement>('#profile-form')!.requestSubmit();
    expect(root.querySelector('[aria-current="step"]')!.getAttribute('data-screen')).toBe('selection');
    expect(root.querySelectorAll('.import-card')).toHaveLength(0);
    expect(root.querySelector('h1')!.textContent).toBe('Готовим список аниме');
    expect(root.querySelector('.collection-owner')?.textContent).toBe('public-user');
    expect(source.load).toHaveBeenCalledWith('public-user', expect.anything());
    expect(button('[data-action="cancel-import"]').disabled).toBe(false);
    expect(selections.get()).toBeNull();
    expect(store.get('shikimori:42')).toBeNull();
    progress!.onProgress!({ stage: 'entries', loaded: 50 });
    expect(root.querySelector('#import-status')!.textContent).toContain('50');
    complete(profileSnapshot());
    await vi.waitFor(() => { expect(root.querySelector('[data-action="cancel-import"]')).toBeNull(); });
    expect(root.querySelectorAll('.anime-choice')).toHaveLength(6);
    expect(store.get('shikimori:42')!.entries).toHaveLength(6);
    expect(store.get('shikimori:42')!.animes[0]!.coverUrl).toContain('/covers/5114.jpg');
    expect(source.enrich).not.toHaveBeenCalled();
  });

  it.each([
    { targetType: 'Anime', fileName: 'public-user_animes.json', collectionId: 'shikimori-json:public-user_animes.json', catalog: 'animes' },
    { targetType: 'Manga', fileName: 'public-user_mangas.json', collectionId: 'manga:shikimori-json:public-user_mangas.json', catalog: 'mangas' },
  ])('сохраняет список $targetType из JSON при сбое подгрузки метаданных', async ({ targetType, fileName, collectionId, catalog }) => {
    vi.mocked(source.enrich).mockRejectedValue(new Error('Недоступно'));
    selectImportMethod('file');
    const input = root.querySelector<HTMLInputElement>('#json-input')!;
    const content = JSON.stringify([{ target_id: 5114, target_type: targetType, target_title: 'Fullmetal Alchemist', status: 'completed', score: 9 }]);
    const files = new DataTransfer();
    files.items.add(new File([content], fileName));
    input.files = files.files;
    root.querySelector<HTMLFormElement>('#json-import-form')!.requestSubmit();
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')?.textContent).toContain('Не удалось подгрузить'));
    expect(store.get(collectionId)!.entries[0]).toMatchObject({ animeId: '5114', originalScore: 9 });
    expect(store.get(collectionId)!.animes[0]!.url).toBe(`https://shikimori.io/${catalog}/5114`);
    expect(selections.get()).toEqual({ collectionId });
    expect(root.querySelectorAll('.anime-choice')).toHaveLength(1);
    expect(source.load).not.toHaveBeenCalled();
  });

  it('после отказа оставляет ошибку на этапе набора и повторяет загрузку без возврата к форме', async () => {
    selectImportMethod('profile');
    vi.mocked(source.load).mockRejectedValue(new Error('Список закрыт'));
    root.querySelector<HTMLInputElement>('#profile-input')!.value = 'public-user';
    root.querySelector<HTMLFormElement>('#profile-form')!.requestSubmit();
    await vi.waitFor(() => { expect(root.querySelector('[data-action="retry-list-import"]')).not.toBeNull(); });
    expect(root.querySelector('[aria-current="step"]')!.getAttribute('data-screen')).toBe('selection');
    expect(root.querySelector('[role="alert"]')!.textContent).toContain('Список закрыт');
    expect(selections.get()).toBeNull();
    vi.mocked(source.load).mockResolvedValue(profileSnapshot());
    button('[data-action="retry-list-import"]').click();
    await vi.waitFor(() => { expect(root.querySelectorAll('.anime-choice')).toHaveLength(6); });
    expect(source.load).toHaveBeenLastCalledWith('public-user', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('при отмене загрузки другого профиля возвращает прежний набор и не меняет его кэш', async () => {
    const snapshot = profileSnapshot();
    await store.set(createCollection(snapshot, ['5114'], 'shikimori:42'));
    startApp(store);
    button('[data-action="resume-selection"]').click();
    await vi.waitFor(() => expect(selections.get()?.collectionId).toBe('shikimori:42'));
    const saved = selections.get();
    button('[data-screen="import"]').click();
    selectImportMethod('profile');
    vi.mocked(source.load).mockImplementation((_input, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new ImportError('cancelled', 'Загрузка отменена.')), { once: true });
    }));
    root.querySelector<HTMLInputElement>('#profile-input')!.value = 'other-user';
    root.querySelector<HTMLFormElement>('#profile-form')!.requestSubmit();
    expect(root.querySelectorAll('.anime-choice')).toHaveLength(0);
    button('[data-action="cancel-import"]').click();
    await vi.waitFor(() => { expect(root.querySelectorAll('.anime-choice')).toHaveLength(6); });
    expect(root.querySelector('.collection-owner')!.textContent).toBe('public-user');
    expect(store.get('shikimori:42')!.selectedIds).toEqual(['5114']);
    expect(selections.get()).toEqual(saved);
  });

  it('всегда показывает продолжение и переключает способ импорта в одной карточке, сохраняя введённый ник', () => {
    expect(Array.from(root.querySelectorAll('.import-card h2'), heading => heading.textContent)).toEqual(['Демонстрация', 'Список Shikimori', 'Продолжить']);
    expect(button('[data-action="resume-selection"]').disabled).toBe(true);
    const method = root.querySelector<HTMLSelectElement>('#import-method')!;
    expect(method.value).toBe('profile');
    expect(Array.from(method.options, option => option.value)).toEqual(['profile', 'file']);
    root.querySelector<HTMLInputElement>('#profile-input')!.value = 'public-user';
    selectImportMethod('file');
    expect(root.querySelector('#json-import-form')).not.toBeNull();
    expect(root.querySelector('#profile-form')).toBeNull();
    selectImportMethod('profile');
    expect(root.querySelector<HTMLInputElement>('#profile-input')!.value).toBe('public-user');
  });

  it('восстанавливает выбор без сети и сохраняет раздельный прогресс списков и демонстрации', async () => {
    selectImportMethod('profile');
    root.querySelector<HTMLInputElement>('#profile-input')!.value = 'public-user';
    root.querySelector<HTMLFormElement>('#profile-form')!.requestSubmit();
    await vi.waitFor(() => { expect(root.querySelectorAll('.anime-choice')).toHaveLength(6); });
    root.querySelector<HTMLElement>('[data-anime="5114"]')!.click();
    await vi.waitFor(() => expect(store.get('shikimori:42')!.selectedIds).toEqual(['5114']));
    const saved = selections.get();

    const refreshed = profileSnapshot();
    refreshed.entries[0]!.originalScore = 7;
    refreshed.animes[0]!.coverUrl = 'https://shikimori.io/covers/updated.jpg';
    vi.mocked(source.load).mockResolvedValue(refreshed);
    vi.mocked(source.enrich).mockClear();
    startApp(store);
    expect(button('[data-action="resume-selection"]').disabled).toBe(false);
    button('[data-action="resume-selection"]').click();
    await vi.waitFor(() => { expect(root.querySelector('[data-action="cancel-import"]')).toBeNull(); });
    expect(root.querySelectorAll('input[name="anime"]:checked')).toHaveLength(1);
    expect(store.get('shikimori:42')!.entries[0]!.originalScore).toBe(9);
    const header = root.querySelector('.collection-summary')!;
    expect(header.textContent).toContain('public-user');
    expect(header.textContent).toContain('Набор восстановлен.');
    expect(header.textContent).not.toContain('Выбрано тайтлов:');
    expect(header.querySelector('[data-action="refresh"]')!.getAttribute('title')).toBe('Обновить список');
    expect(source.load).toHaveBeenCalledTimes(1);
    expect(source.enrich).not.toHaveBeenCalled();
    button('[data-action="refresh"]').click();
    await vi.waitFor(() => expect(store.get('shikimori:42')!.entries[0]!.originalScore).toBe(7));
    expect(store.get('shikimori:42')!.animes[0]!.coverUrl).toBe('https://shikimori.io/covers/updated.jpg');
    expect(store.get('shikimori:42')!.selectedIds).toEqual(['5114']);
    expect(source.enrich).not.toHaveBeenCalled();
    button('[data-screen="import"]').click();
    button('[data-action="load-demo"]').click();
    await vi.waitFor(() => { expect(root.querySelectorAll('input[name="anime"]:checked')).toHaveLength(9); });
    const demo = store.get('demo')!;
    expect(demo.animes.map(anime => anime.id)).toEqual(['9253', '5114', '32281', '199', '16498', '20583', '2167', '2001', '20']);
    expect(demo.animes.every(anime => anime.coverUrl && anime.communityScore !== null)).toBe(true);
    button('[data-action="select-all"]').click();
    expect(selections.get()).toEqual(saved);

    const manga = profileSnapshot();
    manga.media = 'manga';
    manga.animes = [{ ...manga.animes[0]!, name: 'Novel', russian: 'Ранобэ', kind: 'light_novel', url: 'https://shikimori.io/ranobe/5114' }];
    manga.entries = [{ ...manga.entries[0]!, status: 'watching' }];
    vi.mocked(source.load).mockResolvedValue(manga);
    button('[data-screen="import"]').click();
    const media = root.querySelector<HTMLSelectElement>('#import-media')!;
    media.value = 'manga';
    media.dispatchEvent(new Event('change', { bubbles: true }));
    root.querySelector<HTMLFormElement>('#profile-form')!.requestSubmit();
    expect(root.querySelector('h1')?.textContent).toBe('Готовим список манги и ранобэ');
    expect(source.load).toHaveBeenLastCalledWith('public-user', expect.objectContaining({ media: 'manga' }));
    const mangaId = 'manga:shikimori:42';
    await vi.waitFor(() => expect(selections.get()?.collectionId).toBe(mangaId));
    expect(store.get('shikimori:42')!.selectedIds).toEqual(['5114']);
    expect(store.get(mangaId)!.selectedIds).toEqual([]);
    expect(parseCollectionBackup(serializeCollectionBackup(store.get(mangaId)!))).toMatchObject({ media: 'manga' });
    expect(root.querySelector('[data-filter-value="light_novel"]')).not.toBeNull();
    expect(root.querySelector('[data-filter-value="movie"]')).toBeNull();
    button('[data-action="refresh"]').click();
    expect(source.load).toHaveBeenLastCalledWith('public-user', expect.objectContaining({ media: 'manga' }));
    await vi.waitFor(() => expect(root.querySelector('[data-action="refresh"]')).not.toBeNull());
  });
});

/** Создаёт новый экземпляр приложения с переданным хранилищем коллекций. */
function startApp(collections = new MemoryCollectionStore()): void {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector<HTMLElement>('#app')!;
  store = collections;
  mountApp(root, { demo: demoSource, shikimori: source }, store, selections);
}

/** Выбирает способ импорта через нативный список. */
function selectImportMethod(method: string): void {
  const select = root.querySelector<HTMLSelectElement>('#import-method')!;
  select.value = method;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Находит кнопку после возможной перерисовки интерфейса. */
function button(selector: string): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(selector)!;
}

/** Создаёт профиль с полным списком для проверки повторной загрузки личных полей. */
function profileSnapshot(): SourceSnapshot {
  const snapshot = structuredClone(LIST_FIXTURE);
  snapshot.animes = snapshot.animes.map(anime => ({ ...anime, coverUrl: `https://shikimori.io/covers/${anime.id}.jpg` }));
  snapshot.profile = { id: '42', nickname: 'public-user', url: 'https://shikimori.io/public-user', source: 'shikimori' };
  return snapshot;
}
