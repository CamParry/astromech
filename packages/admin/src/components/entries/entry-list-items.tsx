/**
 * One entry in the entries list, as a table row or a grid card, and the row
 * actions both offer in their menu and on right-click.
 */

import type { DropdownItem } from '../ui/dropdown';
import type { CellRenderContext, Entry, TableColumn } from 'astromech';
import { Copy, MoreHorizontalIcon, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { getCellRenderer } from '../../rendering/cell-registry';
import { Link } from '../../rendering/cells/link';
import { statusVariant } from '../../rendering/cells/status-variant';
import { entryEditPath } from '../../utilities/entry-admin-path';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { useContextMenu } from '../ui/context-menu';
import { Dropdown } from '../ui/dropdown';
import { Table } from '../ui/table';

export type RowActionsProps = {
    entry: Entry;
    isTrash: boolean;
    type: string;
    basePath: string;
    canDelete: boolean;
    hasTrashCap: boolean;
    onRestore: (id: string) => void;
    onConfirmDelete: (id: string, force: boolean) => void;
    onDuplicate: (id: string) => void;
    rowLabels: {
        edit: string;
        duplicate: string;
        moveToTrash: string;
        restore: string;
        deletePermanently: string;
    };
};

function buildRowItems(props: RowActionsProps): DropdownItem[] {
    const {
        entry,
        isTrash,
        basePath,
        canDelete,
        hasTrashCap,
        onRestore,
        onConfirmDelete,
        onDuplicate,
        rowLabels,
    } = props;
    if (isTrash) {
        const items: DropdownItem[] = [
            {
                label: rowLabels.restore,
                onClick: () => onRestore(entry.id),
                icon: <RotateCcw size={14} />,
            },
        ];
        if (canDelete) {
            items.push({
                label: rowLabels.deletePermanently,
                variant: 'danger' as const,
                onClick: () => onConfirmDelete(entry.id, true),
                icon: <Trash2 size={14} />,
            });
        }
        return items;
    }
    const items: DropdownItem[] = [
        {
            label: rowLabels.edit,
            href: entryEditPath(basePath, entry.id, { locale: entry.locale }),
            icon: <Pencil size={14} />,
        },
        {
            label: rowLabels.duplicate,
            onClick: () => onDuplicate(entry.id),
            icon: <Copy size={14} />,
        },
    ];
    if (canDelete) {
        // When trash is off, the action is a permanent delete (force=true).
        items.push({
            label: hasTrashCap ? rowLabels.moveToTrash : rowLabels.deletePermanently,
            variant: 'danger' as const,
            onClick: () => onConfirmDelete(entry.id, !hasTrashCap),
            icon: <Trash2 size={14} />,
        });
    }
    return items;
}

type EntryTableRowProps = RowActionsProps & {
    selected: boolean;
    onToggleSelect: (id: string) => void;
    columns: TableColumn[];
    navigate: (opts: { id: string; locale: string }) => void;
    configuredLocales: string[];
    authorNames: Map<string, string>;
};

export function EntryTableRow({
    entry,
    isTrash,
    type,
    basePath,
    canDelete,
    hasTrashCap,
    onRestore,
    onConfirmDelete,
    onDuplicate,
    selected,
    onToggleSelect,
    columns,
    navigate,
    rowLabels,
    configuredLocales,
    authorNames,
}: EntryTableRowProps): React.ReactElement {
    const { t } = useTranslation();
    const items = buildRowItems({
        entry,
        isTrash,
        type,
        basePath,
        canDelete,
        hasTrashCap,
        onRestore,
        onConfirmDelete,
        onDuplicate,
        rowLabels,
    });
    const { onContextMenu, contextMenuNode } = useContextMenu(items);
    const ctx: CellRenderContext = { basePath, configuredLocales, isTrash, authorNames };

    return (
        <>
            <Table.Row
                key={entry.id}
                onContextMenu={onContextMenu}
                onClick={
                    !isTrash
                        ? () =>
                              void navigate({
                                  id: entry.id,
                                  locale: entry.locale,
                              })
                        : undefined
                }
                style={!isTrash ? { cursor: 'pointer' } : undefined}
            >
                <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                        checked={selected}
                        onChange={() => onToggleSelect(entry.id)}
                    />
                </Table.Td>
                {columns.map((col) => {
                    const value =
                        col.source === 'field'
                            ? (entry.fields as Record<string, unknown>)[col.key]
                            : (entry as Record<string, unknown>)[col.key];
                    return (
                        <Table.Td key={col.key}>
                            {getCellRenderer(col.kind)({
                                entry,
                                column: col,
                                value,
                                ctx,
                            })}
                        </Table.Td>
                    );
                })}
                <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Dropdown
                        icon={<MoreHorizontalIcon size={16} />}
                        ariaLabel={t('common.actions')}
                        items={items}
                    />
                </Table.Td>
            </Table.Row>
            {contextMenuNode}
        </>
    );
}

type EntryCardProps = RowActionsProps & {
    columns: TableColumn[];
    columnLabel: (col: TableColumn) => string;
    navigate: (opts: { id: string; locale: string }) => void;
    hasTitle: boolean;
    configuredLocales: string[];
    authorNames: Map<string, string>;
};

export function EntryCard({
    entry,
    isTrash,
    type,
    basePath,
    canDelete,
    hasTrashCap,
    onRestore,
    onConfirmDelete,
    onDuplicate,
    columns,
    columnLabel,
    navigate,
    rowLabels,
    hasTitle,
    configuredLocales,
    authorNames,
}: EntryCardProps): React.ReactElement {
    const { t } = useTranslation();
    const items = buildRowItems({
        entry,
        isTrash,
        type,
        basePath,
        canDelete,
        hasTrashCap,
        onRestore,
        onConfirmDelete,
        onDuplicate,
        rowLabels,
    });
    const { onContextMenu, contextMenuNode } = useContextMenu(items);
    const ctx: CellRenderContext = { basePath, configuredLocales, isTrash, authorNames };

    function handleCardClick() {
        if (isTrash) return;
        void navigate({
            id: entry.id,
            locale: entry.locale,
        });
    }

    return (
        <>
            <div
                className="am-collection-card"
                onContextMenu={onContextMenu}
                onClick={handleCardClick}
            >
                <div
                    className="am-collection-card-actions"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Dropdown
                        icon={<MoreHorizontalIcon size={16} />}
                        ariaLabel={t('common.actions')}
                        items={items}
                    />
                </div>

                {isTrash ? (
                    <span
                        className={
                            hasTitle
                                ? 'am-collection-card-title am-text-muted'
                                : 'am-collection-card-title am-text-muted am-text-mono am-text-sm'
                        }
                    >
                        {hasTitle ? entry.title : entry.id}
                    </span>
                ) : (
                    <Link
                        to={entryEditPath(basePath, entry.id, { locale: entry.locale })}
                        className={
                            hasTitle
                                ? 'am-collection-card-title'
                                : 'am-collection-card-title am-text-mono am-text-sm'
                        }
                        onClick={(e) => e.stopPropagation()}
                    >
                        {hasTitle ? entry.title : entry.id}
                    </Link>
                )}

                <div className="am-collection-card-meta">
                    <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                </div>

                {columns.map((col) => (
                    <div key={col.key} className="am-collection-card-field">
                        <span className="am-collection-card-field-label">
                            {columnLabel(col)}
                        </span>
                        <span>
                            {getCellRenderer(col.kind)({
                                entry,
                                column: col,
                                value: (entry.fields as Record<string, unknown>)[col.key],
                                ctx,
                            })}
                        </span>
                    </div>
                ))}
            </div>
            {contextMenuNode}
        </>
    );
}
