/** Подстраивает названия под место, оставшееся над оценками и другими данными карточки. */
export function observeAnimeCardTitles(container: ParentNode): ResizeObserver | null {
  const titles = container.querySelectorAll<HTMLElement>('.choice-titles:has(h2)');
  if (!titles.length || typeof ResizeObserver === 'undefined') return null;

  const observer = new ResizeObserver(entries => {
    const measured = entries.map(({ target, contentRect }) => {
      const heading = target.querySelector('h2')!;
      const lineHeight = Number.parseFloat(getComputedStyle(heading).lineHeight);
      return { target, singleLine: contentRect.height + 0.5 < 2 * lineHeight };
    });
    for (const { target, singleLine } of measured) target.classList.toggle('is-single-line', singleLine);

    const originals = measured.flatMap(({ target }) => {
      const original = target.querySelector<HTMLElement>('.original-title');
      if (!original) return [];
      const clipped = original.scrollWidth > original.clientWidth
        || original.scrollHeight > original.clientHeight
        || original.getBoundingClientRect().bottom > target.getBoundingClientRect().bottom + 0.5;
      return [{ original, clipped }];
    });
    for (const { original, clipped } of originals) original.classList.toggle('is-clipped', clipped);
  });
  titles.forEach(title => observer.observe(title));
  return observer;
}
