/**
 * The media library's grid body for `DataList`: tiles under a select-all bar
 * when the list offers bulk actions. Clicking a tile opens it rather than
 * selecting it.
 */

import type { SelectionResult } from '../ui/use-selection';
import type { Media } from 'astromech';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../ui/checkbox';
import { ContentGrid } from '../ui/content-grid';
import { MediaCard } from './media-card';

export type MediaGridProps = {
    items: Media[];
    /** The list's selection, or `null` when the tiles offer none. */
    selection: SelectionResult | null;
    onOpenItem: (id: string) => void;
};

export function MediaGrid({
    items,
    selection,
    onOpenItem,
}: MediaGridProps): React.ReactElement {
    const { t } = useTranslation();

    return (
        <>
            {selection !== null && (
                <div className="am-media-select-bar">
                    <Checkbox
                        checked={selection.allChecked}
                        onChange={selection.toggleAll}
                        label={t('common.selectAll')}
                    />
                </div>
            )}
            <ContentGrid.Root>
                {items.map((item) => (
                    <MediaCard
                        key={item.id}
                        item={item}
                        {...(selection !== null
                            ? {
                                  checked: selection.checkedIds.has(item.id),
                                  onToggleCheck: selection.toggle,
                              }
                            : {})}
                        onClick={onOpenItem}
                    />
                ))}
            </ContentGrid.Root>
        </>
    );
}
