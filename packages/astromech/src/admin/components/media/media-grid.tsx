/**
 * Media tiles with bulk selection, under a select-all bar. Clicking a tile
 * opens it rather than selecting it.
 */

import type { Media } from '@/types/index';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/admin/components/ui/checkbox';
import { ContentGrid } from '@/admin/components/ui/content-grid';
import { MediaCard } from './media-card';

export type MediaGridProps = {
    items: Media[];
    checkedIds: Set<string>;
    onToggle: (id: string) => void;
    onToggleAll: () => void;
    allChecked: boolean;
    onOpenItem: (id: string) => void;
};

export function MediaGrid({
    items,
    checkedIds,
    onToggle,
    onToggleAll,
    allChecked,
    onOpenItem,
}: MediaGridProps): React.ReactElement {
    const { t } = useTranslation();

    return (
        <>
            <div className="am-media-select-bar">
                <Checkbox
                    checked={allChecked}
                    onChange={onToggleAll}
                    label={t('common.selectAll')}
                />
            </div>
            <ContentGrid.Root>
                {items.map((item) => (
                    <MediaCard
                        key={item.id}
                        item={item}
                        checked={checkedIds.has(item.id)}
                        onToggleCheck={onToggle}
                        onClick={onOpenItem}
                    />
                ))}
            </ContentGrid.Root>
        </>
    );
}
