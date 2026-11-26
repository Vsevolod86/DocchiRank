import type { SourceSnapshot } from '../entities/collection/model';

export const LIST_FIXTURE: SourceSnapshot = {
  profile: { id: 'demo', nickname: 'Демопрофиль', url: null, source: 'demo' },
  animes: [
    { id: '5114', name: 'Fullmetal Alchemist: Brotherhood', russian: 'Стальной алхимик: Братство', coverUrl: null, communityScore: null, kind: 'tv', url: 'https://shikimori.io/animes/5114' },
    { id: '9253', name: 'Steins;Gate', russian: 'Врата Штейна', coverUrl: null, communityScore: null, kind: 'tv', url: 'https://shikimori.io/animes/9253' },
    { id: '1', name: 'Cowboy Bebop', russian: 'Ковбой Бибоп', coverUrl: null, communityScore: null, kind: 'tv', url: 'https://shikimori.io/animes/1' },
    { id: '199', name: 'Sen to Chihiro no Kamikakushi', russian: 'Унесённые призраками', coverUrl: null, communityScore: null, kind: 'movie', url: 'https://shikimori.io/animes/199' },
    { id: '33352', name: 'Violet Evergarden', russian: 'Вайолет Эвергарден', coverUrl: null, communityScore: null, kind: 'tv', url: 'https://shikimori.io/animes/33352' },
    { id: '32281', name: 'Kimi no Na wa.', russian: 'Твоё имя', coverUrl: null, communityScore: null, kind: 'movie', url: 'https://shikimori.io/animes/32281' },
  ],
  entries: [
    { id: 'demo-5114', animeId: '5114', status: 'completed', originalScore: 9, importedAt: '2026-11-19T00:00:00+07:00' },
    { id: 'demo-9253', animeId: '9253', status: 'completed', originalScore: 8, importedAt: '2026-11-19T00:00:00+07:00' },
    { id: 'demo-1', animeId: '1', status: 'completed', originalScore: 8, importedAt: '2026-11-19T00:00:00+07:00' },
    { id: 'demo-199', animeId: '199', status: 'completed', originalScore: 9, importedAt: '2026-11-19T00:00:00+07:00' },
    { id: 'demo-33352', animeId: '33352', status: 'completed', originalScore: null, importedAt: '2026-11-19T00:00:00+07:00' },
    { id: 'demo-32281', animeId: '32281', status: 'watching', originalScore: null, importedAt: '2026-11-19T00:00:00+07:00' },
  ],
};
