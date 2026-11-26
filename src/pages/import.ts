import type { BackupPreview } from '../features/backup/collection-backups';
import { backupFeedback, importView } from '../widgets/import/import-view';
import type { ImportViewOptions } from '../widgets/import/import-view';
import type { PageView } from './page-view';

/** Раскладывает формы импорта и предпросмотр резервной копии по отдельным участкам. */
export function importPage(options: ImportViewOptions, backup: Readonly<BackupPreview>, icon: string): PageView {
  return {
    content: importView(options, icon),
    footer: '<p>DocchiRank объединяет японский вопрос <i lang="ja-Latn">docchi?</i> («что из двух?») и английское слово <i lang="en">rank</i> («место в рейтинге»).</p>',
    details: [{ id: 'backup-feedback', markup: backupFeedback(backup, options.collections) }],
    panel: null,
  };
}
