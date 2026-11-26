import { describe, expect, it } from 'vitest';
import { beginComparison, canStartComparison } from './comparison';
import { createCollection } from './collection';
import type { Collection } from './model';
import { PairwiseSorterEngine } from '../sorting/engine';
import { ratingAssignments, reconcileRatings } from './ratings';

describe('сценарии коллекции', () => {
  it('добавляет только новые выбранные произведения, сохраняя классы базы и неизменяемые данные предыдущего цикла', () => {
    const original = collection();
    const prior = new PairwiseSorterEngine({ known: [[item('1'), item('2')], [item('3')]], pending: [] });
    original.session = prior.getState();
    const older = new PairwiseSorterEngine({ known: [[item('4')]], pending: [] }).getState();
    original.archivedSessions = [older];
    original.orderedIds = ['1', '2', '3'];
    original.selectedIds = ['1', '4'];
    original.entries[0]!.originalScore = 1;
    const before = structuredClone(original);
    const next = beginComparison(original, 'add');
    expect(original).toEqual(before);
    expect(next.session!.input).toEqual({ known: [['1', '2'], ['3']], pending: ['4'], queue: ['4'] });
    expect(next.archivedSessions).toEqual([older, prior.getState()]);
    next.archivedSessions![0]!.input.known[0]![0] = 'changed';
    expect(original.archivedSessions[0]!.input.known[0]![0]).toBe('4');
  });

  it('пересматривает отдельного члена класса без изменения порядка остальных и без назначения оценок', () => {
    const original = collection();
    original.session = new PairwiseSorterEngine({ known: [[item('1'), item('2')], [item('3')], [item('4')]], pending: [] }).getState();
    original.orderedIds = ['1', '2', '3', '4'];
    const next = beginComparison(original, 'review', ['2']);
    expect(next.session!.input.known).toEqual([['1'], ['3'], ['4']]);
    expect(next.session!.input.pending).toEqual(['2']);
    expect(next.ratings).toEqual(original.ratings);
    expect(original.orderedIds).toEqual(['1', '2', '3', '4']);
  });

  it('принимает единственный тайтл без вопроса и отклоняет пустой набор или дополнение без новых ID', () => {
    const original = collection();
    original.selectedIds = ['1'];
    const single = beginComparison(original, 'new');
    expect(single.session!.progress.current).toBeNull();
    expect(single.orderedIds).toEqual(['1']);
    expect(canStartComparison(single, 'add')).toBe(false);
    expect(() => beginComparison(single, 'add')).toThrow();
    original.selectedIds = [];
    expect(canStartComparison(original, 'new')).toBe(false);
    expect(() => beginComparison(original, 'new')).toThrow();
  });

  it('фиксирует прежние оценки до удаления пересматриваемой опоры и не меняет их при повторном запуске', () => {
    const original = collection();
    original.session = new PairwiseSorterEngine({ known: [[item('1')], [item('2')], [item('3')]], pending: [] }).getState();
    original.orderedIds = ['1', '2', '3'];
    original.ratings = { topScore: 9, boundaries: [{ aboveId: '2', belowId: '3', scoreBelow: 7 }] };
    const expected = ratingAssignments([['1'], ['2'], ['3']], original.ratings);
    const reviewing = beginComparison(original, 'review', ['2']);
    expect(reviewing.ratingTransition).toEqual({ scores: expected, changedIds: ['2'] });
    expect(reviewing.ratings).toEqual(original.ratings);
    const adding = beginComparison(reviewing, 'add', ['4']);
    expect(adding.ratingTransition).toEqual({ scores: expected, changedIds: ['2', '4'] });
    expect(reconcileRatings([['1'], ['3'], ['2'], ['4']], original.ratings, adding.ratingTransition!).assignments)
      .toEqual({ '1': 9, '3': 7, '2': 7, '4': 7 });
  });
});

/** Создаёт небольшой исходный список без порядка и интервальных оценок. */
function collection(): Collection {
  return createCollection({
    profile: { id: '42', nickname: 'User', source: 'shikimori', url: null },
    animes: ['1', '2', '3', '4'].map(id => ({ id, name: id, russian: null, coverUrl: null, communityScore: 8, url: `https://shikimori.io/animes/${id}` })),
    entries: ['1', '2', '3', '4'].map(id => ({ id, animeId: id, status: 'completed', originalScore: 8, importedAt: '2026-11-19T00:00:00Z' })),
  }, ['1', '2', '3', '4'], 'collection');
}

/** Представляет подтверждённый элемент K независимо от текущих полей коллекции. */
function item(id: string): { id: string; title: string; userScore: number; communityScore: number } {
  return { id, title: id, userScore: 8, communityScore: 8 };
}
