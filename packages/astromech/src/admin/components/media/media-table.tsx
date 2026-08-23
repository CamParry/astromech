/**
 * Sortable media table with bulk selection. The page's list view; the picker
 * is grid-only.
 */

import type { SortDirection } from '@/admin/components/ui/table';
import type { Media } from '@/types/index';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/admin/components/ui/checkbox';
import { Table } from '@/admin/components/ui/table';
import { MediaRow } from './media-row';

export type MediaTableProps = {
    items: Media[];
    checkedIds: Set<string>;
    onToggle: (id: string) => void;
    onToggleAll: () => void;
    allChecked: boolean;
    currentSort: { key: string; direction: SortDirection } | null;
    onSort: (key: string, direction: SortDirection) => void;
    onOpenItem: (id: string) => void;
};

export function MediaTable({
    items,
    checkedIds,
    onToggle,
    onToggleAll,
    allChecked,
    currentSort,
    onSort,
    onOpenItem,
}: MediaTableProps): React.ReactElement {
    const { t } = useTranslation();

    return (
        <Table.Root>
            <Table.Head>
                <Table.Row>
                    <Table.Th className="am-table-checkbox-col">
                        <Checkbox
                            checked={allChecked}
                            onChange={onToggleAll}
                            aria-label={t('common.selectAll')}
                        />
                    </Table.Th>
                    <Table.SortTh
                        sortKey="filename"
                        currentSort={currentSort}
                        onSort={onSort}
                    >
                        {t('media.colFile')}
                    </Table.SortTh>
                    <Table.SortTh
                        sortKey="mimeType"
                        currentSort={currentSort}
                        onSort={onSort}
                    >
                        {t('media.metaType')}
                    </Table.SortTh>
                    <Table.SortTh
                        sortKey="size"
                        currentSort={currentSort}
                        onSort={onSort}
                    >
                        {t('media.metaSize')}
                    </Table.SortTh>
                    <Table.SortTh
                        sortKey="createdAt"
                        currentSort={currentSort}
                        onSort={onSort}
                    >
                        {t('media.metaUploaded')}
                    </Table.SortTh>
                </Table.Row>
            </Table.Head>
            <Table.Body>
                {items.map((item) => (
                    <MediaRow
                        key={item.id}
                        item={item}
                        checked={checkedIds.has(item.id)}
                        onToggleCheck={onToggle}
                        onClick={onOpenItem}
                    />
                ))}
            </Table.Body>
        </Table.Root>
    );
}
