import type { ListEntry, SourceSnapshot } from '../entities/collection/model';
import steinsGate from './covers/9253.svg?no-inline';
import alchemist from './covers/5114.svg?no-inline';
import yourName from './covers/32281.svg?no-inline';
import spiritedAway from './covers/199.svg?no-inline';
import attackOnTitan from './covers/16498.svg?no-inline';
import haikyu from './covers/20583.svg?no-inline';
import clannad from './covers/2167.svg?no-inline';
import gurrenLagann from './covers/2001.svg?no-inline';
import naruto from './covers/20.svg?no-inline';

// Метаданные из Shikimori и локальные абстрактные иллюстрации для демонстрации без сети.
const animes: SourceSnapshot['animes'] = [
  { id: "9253", name: "Steins;Gate", russian: "Врата Штейна", coverUrl: steinsGate, communityScore: 9.07, kind: "tv", url: "https://shikimori.io/animes/z9253-steins-gate" },
  { id: "5114", name: "Fullmetal Alchemist: Brotherhood", russian: "Стальной алхимик: Братство", coverUrl: alchemist, communityScore: 9.11, kind: "tv", url: "https://shikimori.io/animes/z5114-fullmetal-alchemist-brotherhood" },
  { id: "32281", name: "Kimi no Na wa.", russian: "Твоё имя", coverUrl: yourName, communityScore: 8.82, kind: "movie", url: "https://shikimori.io/animes/32281-kimi-no-na-wa" },
  { id: "199", name: "Sen to Chihiro no Kamikakushi", russian: "Унесённые призраками", coverUrl: spiritedAway, communityScore: 8.77, kind: "movie", url: "https://shikimori.io/animes/z199-sen-to-chihiro-no-kamikakushi" },
  { id: "16498", name: "Shingeki no Kyojin", russian: "Атака титанов", coverUrl: attackOnTitan, communityScore: 8.58, kind: "tv", url: "https://shikimori.io/animes/16498-shingeki-no-kyojin" },
  { id: "20583", name: "Haikyuu!!", russian: "Волейбол!!", coverUrl: haikyu, communityScore: 8.43, kind: "tv", url: "https://shikimori.io/animes/z20583-haikyuu" },
  { id: "2167", name: "Clannad", russian: "Кланнад", coverUrl: clannad, communityScore: 7.99, kind: "tv", url: "https://shikimori.io/animes/z2167-clannad" },
  { id: "2001", name: "Tengen Toppa Gurren Lagann", russian: "Гуррен-Лаганн, пронзающий небеса", coverUrl: gurrenLagann, communityScore: 8.65, kind: "tv", url: "https://shikimori.io/animes/z2001-tengen-toppa-gurren-lagann" },
  { id: "20", name: "Naruto", russian: "Наруто", coverUrl: naruto, communityScore: 8.03, kind: "tv", url: "https://shikimori.io/animes/z20-naruto" },
];

export const DEMO_SNAPSHOT: SourceSnapshot = {
  profile: { id: 'demo', nickname: 'Демопрофиль', url: null, source: 'demo' },
  animes,
  entries: animes.map(({ id }): ListEntry => ({
    id: `demo-${id}`, animeId: id, status: null, originalScore: null, importedAt: '2026-11-22T00:00:00+07:00',
  })),
};
