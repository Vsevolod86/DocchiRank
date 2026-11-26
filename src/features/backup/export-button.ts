import { renderButton } from '../../shared/ui/button';

/** Показывает экспорт коллекции, в том числе в сообщении об ошибке сохранения. */
export function exportCollectionButton(forSaveError = false): string {
    const label = 'Скачать историю';
    return renderButton({
        label, hidden: forSaveError,
        ...(forSaveError ? { variant: 'secondary' } : {
            variant: 'icon', iconPaths: '<path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/>',
        }),
        attributes: {
            id: forSaveError ? 'export-unsaved-collection' : undefined,
            'data-action': 'export-collection', title: forSaveError ? undefined : label,
        },
    });
}
