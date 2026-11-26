import type { ListMedia, ListStatus, Score, SourceSnapshot, Work } from '../entities/collection/model';
import { LIST_MEDIA_LABELS } from '../entities/collection/model';
import { ImportError, isListStatus, SHIKIMORI_ORIGIN, SHIKIMORI_TARGET_TYPE } from './shikimori-data';

/** Строка выгрузки с исходными значениями полей, включая дополнительные данные. */
type ExportRow = Record<string, unknown> & {
  target_id: number | string;
  target_type: typeof SHIKIMORI_TARGET_TYPE[ListMedia];
  target_title: string;
  target_title_ru?: string | null;
  status: ListStatus;
  score: number;
};

/** Читает штатную выгрузку, определяя категорию по записям или имени пустого файла. */
export function parseShikimoriExport(contents: string, fileName: string, importedAt = new Date().toISOString()): SourceSnapshot {
  const rows = readExportRows(contents);
  if (!fileName.trim()) throw new ImportError('input', 'У файла выгрузки должно быть имя.');
  const media = rows.length ? (rows[0]!.target_type === 'Manga' ? 'manga' : 'anime')
    : /_mangas\.json$/i.test(fileName) ? 'manga' : 'anime';

  const result: SourceSnapshot = {
    profile: {
      id: fileName, nickname: fileName.replace(/\.json$/i, '').replace(/_(animes|mangas)$/i, '').trim() || 'Выгрузка Shikimori',
      url: null, source: 'shikimori-json',
    },
    ...(media === 'manga' ? { media } : {}),
    animes: [], entries: [],
  };
  for (const row of rows) {
    const id = String(row.target_id);
    result.animes.push({
      id, name: row.target_title.trim(), russian: row.target_title_ru?.trim() || null,
      coverUrl: null, communityScore: null, url: `${SHIKIMORI_ORIGIN}/${media}s/${id}`,
    });
    result.entries.push({
      id: `json:${id}`, animeId: id, status: row.status,
      originalScore: row.score === 0 ? null : row.score as Score, importedAt,
    });
  }
  return result;
}

/** Меняет оценки записей выбранной категории и добавляет недостающие тайтлы как запланированные. */
export function updateShikimoriExport(contents: string, grades: ReadonlyMap<string, Score>,
  works: readonly Pick<Work, 'id' | 'name' | 'russian'>[], media: ListMedia = 'anime'): {
  text: string; updated: number; added: ExportRow[];
} {
  const rows = readExportRows(contents);
  const targetType = SHIKIMORI_TARGET_TYPE[media];
  if (rows.length && rows[0]!.target_type !== targetType) {
    throw new ImportError('input', `Выбери выгрузку для списка «${LIST_MEDIA_LABELS[media]}».`);
  }
  const pending = new Map(grades);
  let updated = 0;
  for (const row of rows) {
    const id = String(row.target_id);
    const score = pending.get(id);
    if (score === undefined) continue;
    pending.delete(id);
    if (row.score === score) continue;
    row.score = score;
    updated++;
  }

  const byId = new Map(works.map(work => [work.id, work]));
  const added: ExportRow[] = Array.from(pending, ([id, score]) => {
    const work = byId.get(id);
    if (!work?.name.trim() || !/^[1-9]\d*$/.test(id)) {
      throw new ImportError('input', `Не удалось добавить тайтл #${id}. Проверь его ID и название в коллекции.`);
    }
    const numericId = Number(id);
    return {
      target_title: work.name, target_title_ru: work.russian, target_id: Number.isSafeInteger(numericId) ? numericId : id,
      target_type: targetType, score, status: 'planned', rewatches: 0,
      ...(media === 'manga' ? { volumes: 0, chapters: 0 } : { episodes: 0 }),
      text: null,
    };
  });
  return { text: JSON.stringify(rows.concat(added), null, 2), updated, added };
}

/** Проверяет все строки перед импортом или экспортом и сохраняет их исходный порядок. */
function readExportRows(contents: string): ExportRow[] {
  let rows: unknown;
  try {
    rows = JSON.parse(contents.replace(/^\uFEFF/, ''));
  } catch {
    throw new ImportError('input', 'Не удалось прочитать JSON. Выбери выгрузку списка из Shikimori.');
  }
  if (!Array.isArray(rows)) throw new ImportError('input', 'Ожидается JSON-выгрузка Shikimori с массивом записей.');

  const ids = new Set<string>();
  let targetType: ExportRow['target_type'] | undefined;
  return rows.map((value: unknown, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidRow(index);
    const row = value as Record<string, unknown>;
    const rawId = row.target_id;
    const id = typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId > 0 ? String(rawId)
      : typeof rawId === 'string' && /^[1-9]\d*$/.test(rawId) ? rawId : null;
    if (!id || (row.target_type !== 'Anime' && row.target_type !== 'Manga') || typeof row.target_title !== 'string' || !row.target_title.trim()
      || !isListStatus(row.status) || typeof row.score !== 'number' || !Number.isInteger(row.score) || row.score < 0 || row.score > 10
      || (row.target_title_ru !== undefined && row.target_title_ru !== null && typeof row.target_title_ru !== 'string')) {
      throw invalidRow(index);
    }
    if (targetType && targetType !== row.target_type) {
      throw new ImportError('input', 'В файле есть записи из разных списков Shikimori. Загрузи аниме и мангу с ранобэ отдельными файлами.');
    }
    targetType = row.target_type;
    if (ids.has(id)) throw new ImportError('input', `В записи ${index + 1} повторяется ID тайтла.`);
    ids.add(id);
    return row as ExportRow;
  });
}

/** Указывает проблемную запись, не скрывая повреждённые строки частичным импортом. */
function invalidRow(index: number): ImportError {
  return new ImportError('input', `Запись ${index + 1} не соответствует выгрузке Shikimori. Проверь ID, название, тип (Anime или Manga), статус и оценку 0–10.`);
}
