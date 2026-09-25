/**
 * Entry list page for one entry type id, the site's or a plugin's: a `DataList`
 * over `useListController`, as a table or a grid, with bulk actions and
 * per-type column and view choices.
 */

import type { UseAdminEntryTypeResult } from '../../hooks/use-admin-entry-type';
import type { DataListBulkAction, DataListColumn } from '../ui/data-list';
import type { RowActionsProps } from './entry-list-items';
import type { CellRenderContext, Entry, TableColumn } from 'astromech';
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
import { useViewMode } from '../../hooks/use-view-mode';
import { useVisibleColumns } from '../../hooks/use-visible-columns';
import { resolveLabel } from '../../i18n/labels';
import { defaultCellKind } from '../../rendering/cell-kind-map';
import { getCellRenderer } from '../../rendering/cell-registry';
import { Link } from '../../rendering/cells/link';
import { fieldTypeOf, resolveTable } from '../../rendering/resolve';
import { entryEditPath, entryTypeBasePath } from '../../utilities/entry-admin-path';
import { NotFoundPage } from '../layout/not-found-page';
import { ViewModeToggle } from '../layout/view-mode-toggle';
import { Button } from '../ui/button';
import { DataList } from '../ui/data-list';
import { EmptyState } from '../ui/empty-state';
import { Page, PageContent, PageHeader, PageTitle } from '../ui/page';
import { DeleteEntryModal } from './delete-entry-modal';
import {
    ColumnsMenu,
    LocaleFilterSelect,
    StatusFilterSelect,
} from './entries-list-toolbar';
import { buildRowItems, EntryCard } from './entry-list-items';

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
    const authorNames = useAuthorNames();
    useAiContext({ kind: 'entries', type, label: config.plural }, { depth: 0 });

    const { capabilities } = config;
    const hasTitle = config.titleField !== false;
    const hasI18n = capabilities.translatable;
    const canDelete = can('delete');

    const list = useListController(entryType, { perPage: PER_PAGE });

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
        publish: useAdminMutation(mutations.bulkPublish),
        unpublish: useAdminMutation(mutations.bulkUnpublish),
        trash: useAdminMutation(mutations.bulkTrash),
        delete: useAdminMutation(mutations.bulkDelete),
        restore: useAdminMutation(mutations.bulkRestore),
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

    function handleDeleteConfirm(): void {
        if (deleteTarget === null) return;
        const mutation = deleteTarget.force ? remove : trash;
        mutation.mutate(deleteTarget.entry.id, {
            onSuccess: () => setDeleteTarget(null),
        });
    }

    // The bulk menu, and so row selection, needs the delete permission.
    const bulkActions: DataListBulkAction[] = canDelete
        ? [
              ...(capabilities.statuses && !list.isTrash
                  ? [
                        {
                            label: t('entries.bulkPublishSelected'),
                            icon: <Check size={14} />,
                            run: (ids: string[]) => bulk.publish.mutateAsync(ids),
                        },
                        {
                            label: t('entries.bulkUnpublishSelected'),
                            icon: <RotateCcw size={14} />,
                            run: (ids: string[]) => bulk.unpublish.mutateAsync(ids),
                        },
                    ]
                  : []),
              ...(capabilities.trash && !list.isTrash
                  ? [
                        {
                            label: t('entries.bulkMoveToTrash'),
                            icon: <Trash2 size={14} />,
                            tone: 'danger' as const,
                            // A trashed entry can be restored, so this does not ask first.
                            confirm: false,
                            run: (ids: string[]) => bulk.trash.mutateAsync(ids),
                        },
                    ]
                  : []),
              ...(capabilities.trash && list.isTrash
                  ? [
                        {
                            label: t('entries.bulkRestoreSelected'),
                            icon: <RotateCcw size={14} />,
                            run: (ids: string[]) => bulk.restore.mutateAsync(ids),
                        },
                    ]
                  : []),
              {
                  label: t('common.delete'),
                  icon: <Trash2 size={14} />,
                  tone: 'danger',
                  run: (ids: string[]) => bulk.delete.mutateAsync(ids),
              },
          ]
        : [];

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
    const cellContext: CellRenderContext = {
        basePath,
        configuredLocales: adminConfig.locales,
        isTrash: list.isTrash,
        authorNames,
    };
    const dataColumns: DataListColumn<Entry>[] = tableColumns.map((column) => ({
        key: column.key,
        label: columnLabel(column),
        sortable: column.sortable,
        render: (entry) =>
            getCellRenderer(column.kind)({
                row: entry,
                column,
                value:
                    column.source === 'field'
                        ? (entry.fields as Record<string, unknown>)[column.key]
                        : (entry as Record<string, unknown>)[column.key],
                ctx: cellContext,
            }),
    }));

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
                    <DataList
                        rows={list.data}
                        columns={dataColumns}
                        isLoading={list.isLoading}
                        isError={list.isError}
                        {...(hasTitle
                            ? {
                                  search: list.q,
                                  onSearch: list.setQuery,
                                  searchPlaceholder: t('entries.searchPlaceholder', {
                                      name: config.plural.toLowerCase(),
                                  }),
                              }
                            : {})}
                        sort={list.sort}
                        onSort={list.setSort}
                        page={list.page}
                        pages={list.pages}
                        total={list.total}
                        onPage={list.setPage}
                        rowHref={(entry) =>
                            list.isTrash
                                ? undefined
                                : entryEditPath(basePath, entry.id, {
                                      locale: entry.locale,
                                  })
                        }
                        rowActions={(entry) => buildRowItems({ entry, ...rowProps })}
                        bulkActions={bulkActions}
                        selectionKey={`${list.status}:${list.locale}`}
                        empty={empty}
                        filters={
                            <>
                                {(capabilities.statuses || capabilities.trash) && (
                                    <StatusFilterSelect
                                        value={list.status}
                                        hasStatuses={capabilities.statuses}
                                        hasTrash={capabilities.trash}
                                        onChange={list.setStatus}
                                    />
                                )}
                                {hasI18n && (
                                    <LocaleFilterSelect
                                        value={list.locale}
                                        locales={adminConfig.locales}
                                        onChange={list.setLocale}
                                    />
                                )}
                            </>
                        }
                        toolbarEnd={
                            <>
                                <ColumnsMenu
                                    columns={shownColumns.map((column) => ({
                                        key: column.key,
                                        label: columnLabel(column),
                                    }))}
                                    visible={visibleColumns}
                                    onToggle={toggleColumn}
                                />
                                {views.includes('list') && views.includes('grid') && (
                                    <ViewModeToggle
                                        value={viewMode}
                                        onChange={setViewMode}
                                    />
                                )}
                            </>
                        }
                        {...(viewMode === 'grid'
                            ? {
                                  renderBody: (entries: Entry[]) => (
                                      <div className="am-entry-grid">
                                          {entries.map((entry) => (
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
                                  ),
                              }
                            : {})}
                    />
                </PageContent>
            </Page>
        </>
    );
}
