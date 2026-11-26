import { mountApp } from '../app/mount-app';
import { demoSource } from '../integrations/demo';
import { ShikimoriSource } from '../integrations/shikimori';
import { renderButton } from '../shared/ui/button';
import { MemoryCollectionStore } from '../storage/collection-store';

/** Открывает рабочие виджеты приложения с демонстрационными данными в памяти. */
export function openApplicationSample(): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'catalog-app-dialog';
  dialog.setAttribute('aria-label', 'Демонстрация виджетов');
  dialog.innerHTML = `<form method="dialog" class="catalog-app-toolbar">
    ${renderButton({ label: 'Закрыть демонстрацию', type: 'submit', variant: 'secondary' })}
  </form><div class="catalog-app"></div>`;
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  const shikimori = new ShikimoriSource();
  mountApp(dialog.querySelector<HTMLElement>('.catalog-app')!, {
    demo: demoSource,
    shikimori: {
      async load() { return demoSource.load('demo'); },
      lookupProfile: (input, options) => shikimori.lookupProfile(input, options),
      async enrich(snapshot) { return { snapshot, matched: 0, error: null }; },
    },
  }, new MemoryCollectionStore());
  dialog.showModal();
}
