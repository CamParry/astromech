/**
 * Entry list page for one entry type id, the site's or a plugin's: a searchable,
 * filterable, paginated table or grid over `useListController`, with bulk
 * actions and per-type column and view choices.
 */

import type { UseAdminEntryTypeResult } from '../../hooks/use-admin-entry-type';
import type { DropdownItem } from '../ui/dropdown';
import type { RowActionsProps } from './entry-list-items';
import type { Entry, TableColumn } from 'astromech';
import { useNavigate } from '@tanstack/react-router';
import { Check, PlusIcon, RotateCcw, Trash2 } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { useAiContext } from '../../context/ai-context';
import { useAuthorNames } from '../../hooks/author-names';
import { entryMutations } from '../../hooks/entries';
import { useAdminEntryType } from '../../hooks/use-admin-entry-type';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { useIsMobile } from '../../hooks/use-is-mobile';
import { LOCALE_FILTER_ALL, useListController } from '../../hooks/use-list-controller';
import { useSelection } from '../../hooks/use-selection';
import { useViewMode } from '../../hooks/use-view-mode';
import { useVisibleColumns } from '../../hooks/use-visible-columns';
import { resolveLabel } from '../../i18n/labels';
import { defaultCellKind } from '../../rendering/cell-kind-map';
import { Link } from '../../rendering/cells/link';
import { fieldTypeOf, resolveTable } from '../../rendering/resolve';
import { entryEditPath, entryTypeBasePath } from '../../utilities/entry-admin-path';
import { NotFoundPage } from '../layout/not-found-page';
import { ViewModeToggle } from '../layout/view-mode-toggle';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { useConfirm } from '../ui/confirm';
import { Dropdown } from '../ui/dropdown';
import { EmptyState } from '../ui/empty-state';
import { Page, PageContent, PageHeader, PageTitle } from '../ui/page';
import { Pagination } from '../ui/pagination';
import { SearchInput } from '../ui/search-input';
import { Spinner } from '../ui/spinner';
import { Table } from '../ui/table';
import { Toolbar, ToolbarEnd, ToolbarStart } from '../ui/toolbar';
import { DeleteEntryModal } from './delete-entry-modal';
import {
    ColumnsMenu,
    LocaleFilterSelect,
    StatusFilterSelect,
} from './entries-list-toolbar';
import { EntryCard, EntryTableRow } from './entry-list-items';

const PER_PAGE = 20;

export function EntriesListPage({ type }: { type: string }): React.ReactElement {
    const entryType = useAdminEntryType(type);
    if (entryType === null) return <NotFoundPage path={entryTypeBasePath(type)} />;
    return <EntriesListBody key={type} entryType={entryType} />;
}

function EntriesListBody({
    entryType,
}: {
    entryType: UseAdminEntryTypeResult;
}): React.ReactElement {
    const { type, config, basePath, namespace, can } = entryType;
    const { t } = useTranslation();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const authorNames = useAuthorNames();
    useAiContext({ kind: 'entries', type, label: config.plural }, { depth: 0 });

    const { capabilities } = config;
    const hasTitle = config.titleField !== false;
    const hasI18n = capabilities.translatable;
    const showSearch = hasTitle || (config.search?.length ?? 0) > 0;
    const canDelete = can('delete');

    const list = useListController(entryType, { perPage: PER_PAGE });
    const { checkedIds, toggle, toggleAll, allChecked, someChecked, reset } =
        useSelection(list.data);

    const [visibleColumns, toggleColumn] = useVisibleColumns(
        type,
        config.adminColumns,
        hasTitle
    );
    const views = config.views ?? ['list'];
    const defaultView = config.defaultView ?? 'list';
    const isMobile = useIsMobile();
    const [viewMode, setViewMode] = useViewMode(`entry:${type}`, defaultView, {
        storageKey: isMobile ? `entry:${type}:mobile` : `entry:${type}`,
        defaultView: isMobile && views.includes('grid') ? 'grid' : defaultView,
    });

    // System columns label through an i18n key, the type's own through its label.
    const columnLabel = useCallback(
        (column: TableColumn): string =>
            column.system
                ? t(typeof column.label === 'string' ? column.label : column.label.$t)
                : resolveLabel(column.label, column.key, t, namespace),
        [t, namespace]
    );
    const table = React.useMemo(() => resolveTable(config), [config]);
    const shownColumns = table.columns.filter((column) => {
        if (column.requires == null) return true;
        switch (column.requires) {
            case 'title':
                return hasTitle;
            case 'statuses':
                return capabilities.statuses;
            case 'slug':
                return capabilities.slug;
            case 'locale':
                return hasI18n && list.locale === LOCALE_FILTER_ALL;
            case 'translatable':
                return hasI18n;
        }
    });
    const tableColumns = shownColumns.filter((column) => visibleColumns.has(column.key));
    // Grid fields render through the cell registry, as the table's do.
    const gridColumns: TableColumn[] = (config.gridFields ?? []).map((gridField) => ({
        key: gridField.field,
        label: gridField.label ?? gridField.field,
        kind: defaultCellKind(fieldTypeOf(config, gridField.field)),
        source: 'field',
        sortable: false,
        system: false,
    }));

    const mutations = entryMutations(type, config.single);
    const trash = useAdminMutation(mutations.trash);
    const remove = useAdminMutation(mutations.delete);
    const restore = useAdminMutation(mutations.restore);
    const duplicate = useAdminMutation(mutations.duplicate, {
        onSuccess: (entry) => openEntry(entry),
    });
    const bulk = {
        publish: useAdminMutation(mutations.bulkPublish, { onSuccess: reset }),
        unpublish: useAdminMutation(mutations.bulkUnpublish, { onSuccess: reset }),
        trash: useAdminMutation(mutations.bulkTrash, { onSuccess: reset }),
        delete: useAdminMutation(mutations.bulkDelete, { onSuccess: reset }),
        restore: useAdminMutation(mutations.bulkRestore, { onSuccess: reset }),
    };

    // The trash or force-delete the modal is confirming.
    const [deleteTarget, setDeleteTarget] = useState<{
        entry: Entry;
        force: boolean;
    } | null>(null);

    function openEntry(entry: Pick<Entry, 'id' | 'locale'>): void {
        void navigate({
            to: entryEditPath(basePath, entry.id, { locale: entry.locale }),
        });
    }

    function handleBulk(action: keyof typeof bulk): void {
        const ids = [...checkedIds];
        if (ids.length > 0) bulk[action].mutate(ids);
    }

    function handleDeleteConfirm(): void {
        if (deleteTarget === null) return;
        const mutation = deleteTarget.force ? remove : trash;
        mutation.mutate(deleteTarget.entry.id, {
            onSuccess: () => setDeleteTarget(null),
        });
    }

    const bulkItems: DropdownItem[] = [
        ...(capabilities.statuses && !list.isTrash
            ? [
                  {
                      label: t('entries.bulkPublishSelected'),
                      icon: <Check size={14} />,
                      onClick: () => handleBulk('publish'),
                  },
                  {
                      label: t('entries.bulkUnpublishSelected'),
                      icon: <RotateCcw size={14} />,
                      onClick: () => handleBulk('unpublish'),
                  },
              ]
            : []),
        ...(capabilities.trash && !list.isTrash
            ? [
                  {
                      label: t('entries.bulkMoveToTrash'),
                      icon: <Trash2 size={14} />,
                      variant: 'danger' as const,
                      onClick: () => handleBulk('trash'),
                  },
              ]
            : []),
        ...(capabilities.trash && list.isTrash
            ? [
                  {
                      label: t('entries.bulkRestoreSelected'),
                      icon: <RotateCcw size={14} />,
                      onClick: () => handleBulk('restore'),
                  },
              ]
            : []),
        {
            label: t('media.bulkDeleteButton'),
            icon: <Trash2 size={14} />,
            variant: 'danger',
            onClick: () =>
                confirm({
                    title: t('media.bulkDeleteTitle', { count: checkedIds.size }),
                    description: t('media.bulkDeleteDescription'),
                    confirmLabel: t('common.delete'),
                    onConfirm: () => handleBulk('delete'),
                }),
        },
    ];

    const rowProps: Omit<RowActionsProps, 'entry'> & {
        navigate: (entry: { id: string; locale: string }) => void;
        configuredLocales: string[];
        authorNames: Map<string, string>;
    } = {
        isTrash: list.isTrash,
        type,
        basePath,
        canDelete,
        hasTrashCap: capabilities.trash,
        onRestore: (id) => restore.mutate(id),
        onConfirmDelete: (id, force) => {
            const entry = list.data.find((row) => row.id === id);
            if (entry !== undefined) setDeleteTarget({ entry, force });
        },
        onDuplicate: (id) => duplicate.mutate(id),
        navigate: openEntry,
        rowLabels: {
            edit: t('entries.rowEdit'),
            duplicate: t('entries.rowDuplicate'),
            moveToTrash: t('entries.rowMoveToTrash'),
            restore: t('common.restore'),
            deletePermanently: t('entries.rowDeletePermanently'),
        },
        configuredLocales: adminConfig.locales,
        authorNames,
    };

    const empty = (
        <EmptyState
            title={t('entries.empty', { name: config.plural.toLowerCase() })}
            description={
                list.q
                    ? t('entries.emptySearch')
                    : list.isTrash
                      ? t('entries.emptyTrash')
                      : t('entries.emptyCreate', { name: config.single.toLowerCase() })
            }
            action={
                !list.isTrash && !list.q ? (
                    <Link to={`${basePath}/new`}>
                        <Button size="sm">
                            {t('entries.new', { name: config.single })}
                        </Button>
                    </Link>
                ) : undefined
            }
        />
    );
    // Checkbox, data columns, actions.
    const colSpan = tableColumns.length + 2;

    return (
        <>
            <DeleteEntryModal
                open={deleteTarget !== null}
                entry={deleteTarget?.entry ?? null}
                typeLabel={config.single}
                force={deleteTarget?.force ?? false}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={handleDeleteConfirm}
                loading={trash.isPending || remove.isPending}
            />
            <Page>
                <PageHeader>
                    <PageTitle>{config.plural}</PageTitle>
                    {can('create') && (
                        <Link
                            to={`${basePath}/new`}
                            search={
                                hasI18n && list.locale !== LOCALE_FILTER_ALL
                                    ? { locale: list.locale }
                                    : {}
                            }
                        >
                            <Button icon={<PlusIcon size={16} />}>
                                {t('entries.new', { name: config.single })}
                            </Button>
                        </Link>
                    )}
                </PageHeader>

                <PageContent>
                    <Toolbar>
                        <ToolbarStart>
                            {someChecked && canDelete && (
                                <Dropdown
                                    label={`${t('media.bulkActions')} (${checkedIds.size})`}
                                    variant="secondary"
                                    align="start"
                                    items={bulkItems}
                                />
                            )}
                            {showSearch && (
                                <SearchInput
                                    placeholder={t('entries.searchPlaceholder', {
                                        name: config.plural.toLowerCase(),
                                    })}
                                    value={list.q}
                                    onChange={(e) => list.setQuery(e.target.value)}
                                />
                            )}
                            {(capabilities.statuses || capabilities.trash) && (
                                <StatusFilterSelect
                                    value={list.status}
                                    hasStatuses={capabilities.statuses}
                                    hasTrash={capabilities.trash}
                                    onChange={(value) => {
                                        list.setStatus(value);
                                        reset();
                                    }}
                                />
                            )}
                            {hasI18n && (
                                <LocaleFilterSelect
                                    value={list.locale}
                                    locales={adminConfig.locales}
                                    onChange={(value) => {
                                        list.setLocale(value);
                                        reset();
                                    }}
                                />
                            )}
                        </ToolbarStart>
                        <ToolbarEnd>
                            <ColumnsMenu
                                columns={shownColumns.map((column) => ({
                                    key: column.key,
                                    label: columnLabel(column),
                                }))}
                                visible={visibleColumns}
                                onToggle={toggleColumn}
                            />
                            {views.includes('list') && views.includes('grid') && (
                                <ViewModeToggle value={viewMode} onChange={setViewMode} />
                            )}
                        </ToolbarEnd>
                    </Toolbar>

                    {viewMode === 'grid' &&
                        (list.isLoading ? (
                            <div className="am-entry-grid-loading">
                                <Spinner />
                            </div>
                        ) : list.data.length === 0 ? (
                            empty
                        ) : (
                            <div className="am-entry-grid">
                                {list.data.map((entry) => (
                                    <EntryCard
                                        key={entry.id}
                                        entry={entry}
                                        {...rowProps}
                                        columns={gridColumns}
                                        columnLabel={columnLabel}
                                        hasTitle={hasTitle}
                                    />
                                ))}
                            </div>
                        ))}

                    {viewMode === 'list' && (
                        <Table.Root>
                            <Table.Head>
                                <Table.Row>
                                    <Table.Th className="am-table-select">
                                        <Checkbox
                                            checked={allChecked}
                                            onChange={() => toggleAll()}
                                        />
                                    </Table.Th>
                                    {tableColumns.map((column) =>
                                        column.sortable ? (
                                            <Table.SortTh
                                                key={column.key}
                                                sortKey={column.key}
                                                currentSort={list.sort}
                                                onSort={list.setSort}
                                            >
                                                {columnLabel(column)}
                                            </Table.SortTh>
                                        ) : (
                                            <Table.Th key={column.key}>
                                                {columnLabel(column)}
                                            </Table.Th>
                                        )
                                    )}
                                    <Table.Th className="am-table-icon" />
                                </Table.Row>
                            </Table.Head>
                            <Table.Body>
                                {list.isLoading ? (
                                    <Table.Empty colSpan={colSpan}>
                                        <Spinner />
                                    </Table.Empty>
                                ) : list.data.length === 0 ? (
                                    <Table.Empty colSpan={colSpan}>{empty}</Table.Empty>
                                ) : (
                                    list.data.map((entry) => (
                                        <EntryTableRow
                                            key={entry.id}
                                            entry={entry}
                                            {...rowProps}
                                            selected={checkedIds.has(entry.id)}
                                            onToggleSelect={toggle}
                                            columns={tableColumns}
                                        />
                                    ))
                                )}
                            </Table.Body>
                        </Table.Root>
                    )}

                    <Pagination
                        currentPage={list.page}
                        totalPages={list.pages}
                        onPage={list.setPage}
                        totalItems={list.total}
                    />
                </PageContent>
            </Page>
        </>
    );
}
