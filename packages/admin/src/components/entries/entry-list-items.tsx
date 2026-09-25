/**
 * One entry in the entries grid as a card, and the row actions the card and
 * the table row both offer in their menu and on right-click.
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
import { useContextMenu } from '../ui/context-menu';
import { Dropdown } from '../ui/dropdown';

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

/** The row actions an entry offers, in its menu and on right-click. */
export function buildRowItems(props: RowActionsProps): DropdownItem[] {
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

type EntryCardProps = RowActionsProps & {
    columns: TableColumn[];
    columnLabel: (col: TableColumn) => string;
    navigate: (opts: { id: string; locale: string }) => void;
    hasTitle: boolean;
    configuredLocales: string[];
    authorNames: Map<string, string>;
};

export function EntryCard(props: EntryCardProps): React.ReactElement {
    const {
        entry,
        isTrash,
        basePath,
        columns,
        columnLabel,
        navigate,
        hasTitle,
        configuredLocales,
        authorNames,
    } = props;
    const { t } = useTranslation();
    const items = buildRowItems(props);
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
                className="am-entry-card"
                onContextMenu={onContextMenu}
                onClick={handleCardClick}
            >
                <div
                    className="am-entry-card-actions"
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
                                ? 'am-entry-card-title am-text-muted'
                                : 'am-entry-card-title am-text-muted am-text-mono am-text-sm'
                        }
                    >
                        {hasTitle ? entry.title : entry.id}
                    </span>
                ) : (
                    <Link
                        to={entryEditPath(basePath, entry.id, { locale: entry.locale })}
                        className={
                            hasTitle
                                ? 'am-entry-card-title'
                                : 'am-entry-card-title am-text-mono am-text-sm'
                        }
                        onClick={(e) => e.stopPropagation()}
                    >
                        {hasTitle ? entry.title : entry.id}
                    </Link>
                )}

                <div className="am-entry-card-meta">
                    <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                </div>

                {columns.map((col) => (
                    <div key={col.key} className="am-entry-card-field">
                        <span className="am-entry-card-field-label">
                            {columnLabel(col)}
                        </span>
                        <span>
                            {getCellRenderer(col.kind)({
                                row: entry,
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
