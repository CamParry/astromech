/**
 * A list of rows over data and callbacks: a toolbar with search and filters, a
 * table with sortable headers, selection with bulk actions, a row link, row
 * actions, pagination, and the loading, error and empty states.
 */

import type { DropdownItem } from './dropdown';
import type { SortDirection } from './table';
import type { ListSort } from './use-list-state';
import { useNavigate } from '@tanstack/react-router';
import { MoreHorizontalIcon } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '../../rendering/cells/link';
import { Checkbox } from './checkbox';
import { useConfirm } from './confirm';
import { useContextMenu } from './context-menu';
import { Dropdown } from './dropdown';
import { EmptyState } from './empty-state';
import { Pagination } from './pagination';
import { SearchInput } from './search-input';
import { Spinner } from './spinner';
import { Table } from './table';
import { Toolbar, ToolbarEnd, ToolbarStart } from './toolbar';
import { useSelection } from './use-selection';

/** One column of a `DataList`. */
export type DataListColumn<Row> = {
    key: string;
    label: string;
    /** Offer a sort on this column's `key`; needs the list's `onSort`. */
    sortable?: boolean;
    /** Render the cell's content as the row link, so the row is reachable by keyboard. */
    link?: boolean;
    /** A class for the header and every cell, such as `am-table-icon` for a narrow column. */
    className?: string;
    render: (row: Row) => React.ReactNode;
};

/** An action over the selected rows. */
export type DataListBulkAction = {
    label: string;
    /** Runs with the selected ids; the selection clears once a returned promise resolves. */
    run: (ids: string[]) => unknown;
    tone?: 'default' | 'danger';
    icon?: React.ReactNode;
    /** Ask before running. Defaults to `true` for a `danger` action. */
    confirm?: boolean;
};

export type DataListProps<Row extends { id: string }> = {
    rows: Row[];
    columns: DataListColumn<Row>[];
    isLoading?: boolean;
    isError?: boolean;
    /** The search text; the search input shows when `onSearch` is given. */
    search?: string;
    onSearch?: (value: string) => void;
    searchPlaceholder?: string;
    sort?: ListSort | null;
    onSort?: (key: string, direction: SortDirection) => void;
    /** The current page, from 1; pagination shows when `onPage` is given. */
    page?: number;
    pages?: number;
    total?: number;
    onPage?: (page: number) => void;
    /** Where a row leads; `undefined` leaves that row unlinked. */
    rowHref?: (row: Row) => string | undefined;
    /** The row's menu, also opened by a right-click on the row. */
    rowActions?: (row: Row) => DropdownItem[];
    /** Actions over the selected rows; giving any adds the selection column. */
    bulkActions?: DataListBulkAction[];
    /** Controls after the search input, such as filters. */
    filters?: React.ReactNode;
    /** Controls at the end of the toolbar, such as a view toggle. */
    toolbarEnd?: React.ReactNode;
    /** What an empty list shows. */
    empty?: React.ReactNode;
    /** Clears the selection when it changes, beside the search, sort and page. */
    selectionKey?: string;
    /** Renders the rows in place of the table, such as a card grid. */
    renderBody?: (rows: Row[]) => React.ReactNode;
};

export function DataList<Row extends { id: string }>({
    rows,
    columns,
    isLoading = false,
    isError = false,
    search,
    onSearch,
    searchPlaceholder,
    sort = null,
    onSort,
    page,
    pages,
    total,
    onPage,
    rowHref,
    rowActions,
    bulkActions = [],
    filters,
    toolbarEnd,
    empty,
    selectionKey,
    renderBody,
}: DataListProps<Row>): React.ReactElement {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const scope = [
        search ?? '',
        sort === null ? '' : `${sort.key}:${sort.direction}`,
        page ?? '',
        selectionKey ?? '',
    ].join('\u0000');
    const selection = useSelection(rows, scope);
    const selectable = bulkActions.length > 0 && renderBody === undefined;

    function handleBulk(action: DataListBulkAction): void {
        const ids = [...selection.checkedIds];
        if (ids.length === 0) return;
        const run = (): void => {
            // A rejected run keeps the selection so the user can retry; the
            // caller reports the failure.
            Promise.resolve(action.run(ids)).then(selection.reset, () => undefined);
        };
        if (action.confirm ?? action.tone === 'danger') {
            confirm({
                title: t('list.confirmTitle', {
                    action: action.label,
                    count: ids.length,
                }),
                ...(action.tone === 'danger'
                    ? {
                          description: t('list.confirmDescription'),
                          variant: 'danger' as const,
                      }
                    : { variant: 'primary' as const }),
                confirmLabel: action.label,
                onConfirm: run,
            });
        } else {
            run();
        }
    }

    const emptyNode = empty ?? <EmptyState title={t('common.noResults')} />;
    const errorNode = <EmptyState title={t('list.loadFailed')} />;
    const colSpan =
        columns.length + (selectable ? 1 : 0) + (rowActions !== undefined ? 1 : 0);

    const hasToolbar =
        onSearch !== undefined ||
        filters !== undefined ||
        toolbarEnd !== undefined ||
        bulkActions.length > 0;

    return (
        <>
            {hasToolbar && (
                <Toolbar>
                    <ToolbarStart>
                        {selectable && selection.someChecked && (
                            <Dropdown
                                label={t('list.bulkActions', {
                                    count: selection.checkedIds.size,
                                })}
                                variant="secondary"
                                align="start"
                                items={bulkActions.map((action) => ({
                                    label: action.label,
                                    ...(action.icon !== undefined
                                        ? { icon: action.icon }
                                        : {}),
                                    ...(action.tone === 'danger'
                                        ? { variant: 'danger' as const }
                                        : {}),
                                    onClick: () => handleBulk(action),
                                }))}
                            />
                        )}
                        {onSearch !== undefined && (
                            <SearchInput
                                placeholder={searchPlaceholder ?? t('common.search')}
                                value={search ?? ''}
                                onChange={(e) => onSearch(e.target.value)}
                            />
                        )}
                        {filters}
                    </ToolbarStart>
                    {toolbarEnd !== undefined && <ToolbarEnd>{toolbarEnd}</ToolbarEnd>}
                </Toolbar>
            )}

            {renderBody !== undefined ? (
                isLoading ? (
                    <div className="am-data-list-loading" aria-busy="true">
                        <Spinner />
                    </div>
                ) : isError ? (
                    errorNode
                ) : rows.length === 0 ? (
                    emptyNode
                ) : (
                    renderBody(rows)
                )
            ) : (
                <Table.Root aria-busy={isLoading || undefined}>
                    <Table.Head>
                        <Table.Row>
                            {selectable && (
                                <Table.Th className="am-table-select">
                                    <Checkbox
                                        ariaLabel={t('common.selectAll')}
                                        checked={selection.allChecked}
                                        onChange={() => selection.toggleAll()}
                                    />
                                </Table.Th>
                            )}
                            {columns.map((column) =>
                                column.sortable === true && onSort !== undefined ? (
                                    <Table.SortTh
                                        key={column.key}
                                        className={column.className}
                                        sortKey={column.key}
                                        currentSort={sort}
                                        onSort={onSort}
                                    >
                                        {column.label}
                                    </Table.SortTh>
                                ) : (
                                    <Table.Th
                                        key={column.key}
                                        className={column.className}
                                    >
                                        {column.label}
                                    </Table.Th>
                                )
                            )}
                            {rowActions !== undefined && (
                                <Table.Th className="am-table-icon" />
                            )}
                        </Table.Row>
                    </Table.Head>
                    <Table.Body>
                        {isLoading ? (
                            <Table.Empty colSpan={colSpan}>
                                <Spinner />
                            </Table.Empty>
                        ) : isError ? (
                            <Table.Empty colSpan={colSpan}>{errorNode}</Table.Empty>
                        ) : rows.length === 0 ? (
                            <Table.Empty colSpan={colSpan}>{emptyNode}</Table.Empty>
                        ) : (
                            rows.map((row) => (
                                <DataListRow
                                    key={row.id}
                                    row={row}
                                    columns={columns}
                                    href={rowHref?.(row)}
                                    actions={rowActions?.(row)}
                                    selectable={selectable}
                                    selected={selection.checkedIds.has(row.id)}
                                    onToggle={selection.toggle}
                                />
                            ))
                        )}
                    </Table.Body>
                </Table.Root>
            )}

            {onPage !== undefined && page !== undefined && pages !== undefined && (
                <Pagination
                    currentPage={page}
                    totalPages={pages}
                    onPage={onPage}
                    {...(total !== undefined ? { totalItems: total } : {})}
                />
            )}
        </>
    );
}

type DataListRowProps<Row extends { id: string }> = {
    row: Row;
    columns: DataListColumn<Row>[];
    href: string | undefined;
    actions: DropdownItem[] | undefined;
    selectable: boolean;
    selected: boolean;
    onToggle: (id: string) => void;
};

function DataListRow<Row extends { id: string }>({
    row,
    columns,
    href,
    actions,
    selectable,
    selected,
    onToggle,
}: DataListRowProps<Row>): React.ReactElement {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { onContextMenu, contextMenuNode } = useContextMenu(actions ?? []);

    function handleClick(e: React.MouseEvent<HTMLTableRowElement>): void {
        if (href === undefined) return;
        // A link inside the row navigates by itself.
        if (e.target instanceof Element && e.target.closest('a') !== null) return;
        void navigate({ to: href });
    }

    return (
        <>
            <Table.Row
                href={href}
                selected={selected}
                onClick={handleClick}
                {...(actions !== undefined ? { onContextMenu } : {})}
            >
                {selectable && (
                    // The cell stops the click, so ticking a row does not open it.
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                            ariaLabel={t('list.selectRow')}
                            checked={selected}
                            onChange={() => onToggle(row.id)}
                        />
                    </Table.Td>
                )}
                {columns.map((column) => (
                    <Table.Td key={column.key} className={column.className}>
                        {column.link === true && href !== undefined ? (
                            <Link to={href} className="am-link">
                                {column.render(row)}
                            </Link>
                        ) : (
                            column.render(row)
                        )}
                    </Table.Td>
                ))}
                {actions !== undefined && (
                    // The menu renders in a portal, whose clicks still bubble here.
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                        <Dropdown
                            icon={<MoreHorizontalIcon size={16} />}
                            ariaLabel={t('common.actions')}
                            items={actions}
                        />
                    </Table.Td>
                )}
            </Table.Row>
            {actions !== undefined && contextMenuNode}
        </>
    );
}
