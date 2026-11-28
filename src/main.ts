import './config/interface.css';
import './app/layout.css';
import './styles.css';
import './entities/anime/anime-card.css';
import './widgets/anime-card-layout.css';
import './widgets/comparison-history/history-view.css';
import './widgets/result/rating-editor.css';
import './widgets/result/result-table.css';
import './widgets/settings/filter-controls.css';
import { demoSource } from './integrations/demo';
import { ShikimoriSource } from './integrations/shikimori';
import { BrowserCollectionStore } from './storage/collection-store';
import { BrowserSelectionStore } from './storage/selection-store';
import { mountApp } from './app/mount-app';
import { restoreTheme } from './app/theme';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Не найден корневой элемент приложения.');
restoreTheme(document);

root.textContent = 'Загружаю коллекции…';
const store = await BrowserCollectionStore.open();
mountApp(root, { demo: demoSource, shikimori: new ShikimoriSource() }, store, new BrowserSelectionStore());
