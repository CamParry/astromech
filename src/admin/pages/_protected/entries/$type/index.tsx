/**
 * Entry type list page.
 *
 * Shows a searchable, filterable, paginated table or grid of entries for a
 * given entry type. Supports bulk selection and row-level actions (edit,
 * duplicate, trash/restore). Per-type view preference is persisted to localStorage.
 */

import { formatDate } from '@/support/dates.js';
import { Menu } from '@base-ui/react/menu';
import { useQueries } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate, useParams } from '@tanstack/react-router';
import {
    Check,
    Copy,
    LayoutGrid,
    LayoutList,
    MoreHorizontalIcon,
    Pencil,
    PlusIcon,
    RotateCcw,
    SlidersHorizontal,
    Trash2,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { Astromech } from '@/sdk/fetch/index.js';
import type { Entry } from '@/types/index.js';
import type { DropdownItem } from '@/admin/components/ui/dropdown.js';
import {
    Badge,
    Button,
    Checkbox,
    Dropdown,
    EmptyState,
    Page,
    PageContent,
    PageHeader,
    PageTitle,
    Pagination,
    SearchInput,
    Select,
    Spinner,
    Table,
    ToggleGroup,
    Toolbar,
    ToolbarStart,
    ToolbarEnd,
    useConfirm,
    useContextMenu,
    useToast,
} from '@/admin/components/ui/index.js';
import type { SortDirection } from '@/admin/components/ui/table.js';
import {
    useSelection,
    useViewMode,
    usePermissions,
    useEntriesQuery,
    useTrashEntry,
    useDeleteEntry,
    useDuplicateEntry,
    useRestoreEntry,
    useBulkTrashEntries,
    useBulkDeleteEntries,
    useBulkPublishEntries,
    useBulkUnpublishEntries,
} from '@/admin/hooks/index.js';

// ============================================================================
// Types
// ============================================================================

type StatusFilter = 'all' | 'draft' | 'published' | 'scheduled' | 'trashed';

type BulkAction = 'publish' | 'unpublish' | 'trash' | 'delete' | 'restore';

type ViewMode = 'list' | 'grid';

// ============================================================================
// Helpers
// ============================================================================

function statusVariant(status: string): 'draft' | 'published' | 'scheduled' | 'default' {
    if (status === 'draft') return 'draft';
    if (status === 'published') return 'published';
    if (status === 'scheduled') return 'scheduled';
    return 'default';
}

const ALL_COLUMNS = ['title', 'status', 'slug', 'locale', 'updatedAt'] as const;

function colStorageKey(type: string): string {
    return `am-cols-${type}`;
}

function readStoredColumns(
    type: string,
    adminCols: { field: string }[]
): Set<string> {
    try {
        const stored = localStorage.getItem(colStorageKey(type));
        if (stored) {
            const parsed = JSON.parse(stored) as string[];
            if (Array.isArray(parsed)) return new Set(parsed);
        }
    } catch {
        // ignore
    }
    return new Set([...ALL_COLUMNS, ...adminCols.map((c) => c.field)]);
}

function writeStoredColumns(type: string, cols: Set<string>): void {
    try {
        localStorage.setItem(colStorageKey(type), JSON.stringify(Array.from(cols)));
    } catch {
        // ignore
    }
}

const PER_PAGE = 20;

// ============================================================================
// Sub-components
// ============================================================================

type RowActionsProps = {
    entry: Entry;
    isTrash: boolean;
    type: string;
    canDelete: boolean;
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
        type,
        canDelete,
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
            href: `/entries/${type}/${entry.id}`,
            icon: <Pencil size={14} />,
        },
        {
            label: rowLabels.duplicate,
            onClick: () => onDuplicate(entry.id),
            icon: <Copy size={14} />,
        },
    ];
    if (canDelete) {
        items.push({
            label: rowLabels.moveToTrash,
            variant: 'danger' as const,
            onClick: () => onConfirmDelete(entry.id, false),
            icon: <Trash2 size={14} />,
        });
    }
    return items;
}

// ============================================================================
// Table row with context menu
// ============================================================================

type EntryTableRowProps = RowActionsProps & {
    selected: boolean;
    onToggleSelect: (id: string) => void;
    adminColumns: { field: string; label?: string; sortable?: boolean }[];
    navigate: (opts: { to: string; params: { type: string; id: string } }) => void;
    visibleColumns: Set<string>;
    translationCount?: number | undefined;
};

function EntryTableRow({
    entry,
    isTrash,
    type,
    canDelete,
    onRestore,
    onConfirmDelete,
    onDuplicate,
    selected,
    onToggleSelect,
    adminColumns,
    navigate,
    visibleColumns,
    rowLabels,
    translationCount,
}: EntryTableRowProps): React.ReactElement {
    const { t } = useTranslation();
    const items = buildRowItems({
        entry,
        isTrash,
        type,
        canDelete,
        onRestore,
        onConfirmDelete,
        onDuplicate,
        rowLabels,
    });
    const { onContextMenu, contextMenuNode } = useContextMenu(items);

    return (
        <>
            <Table.Row
                key={entry.id}
                onContextMenu={onContextMenu}
                onClick={
                    !isTrash
                        ? () =>
                              void navigate({
                                  to: '/entries/$type/$id',
                                  params: { type, id: entry.id },
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
                {visibleColumns.has('title') && (
                    <Table.Td>
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.375rem',
                            }}
                        >
                            {isTrash ? (
                                <span className="am-text-muted">{entry.title}</span>
                            ) : (
                                <Link
                                    to="/entries/$type/$id"
                                    params={{ type, id: entry.id }}
                                    className="am-link"
                                >
                                    {entry.title}
                                </Link>
                            )}
                            {translationCount != null && translationCount > 0 && (
                                <Badge variant="neutral">+{translationCount}</Badge>
                            )}
                        </span>
                    </Table.Td>
                )}
                {visibleColumns.has('status') && (
                    <Table.Td>
                        <Badge variant={statusVariant(entry.status)}>
                            {entry.status}
                        </Badge>
                    </Table.Td>
                )}
                {visibleColumns.has('slug') && (
                    <Table.Td>
                        <span className="am-text-mono am-text-muted">
                            {entry.slug ?? '—'}
                        </span>
                    </Table.Td>
                )}
                {adminColumns
                    .filter((col) => visibleColumns.has(col.field))
                    .map((col) => (
                        <Table.Td key={col.field}>
                            {String(
                                (entry.fields as Record<string, unknown>)[col.field] ??
                                    '—'
                            )}
                        </Table.Td>
                    ))}
                {visibleColumns.has('updatedAt') && (
                    <Table.Td className="am-text-sm am-text-muted">
                        {formatDate(entry.updatedAt)}
                    </Table.Td>
                )}
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

// ============================================================================
// Grid card with context menu
// ============================================================================

type EntryCardProps = RowActionsProps & {
    gridFields: { field: string; label?: string }[];
    navigate: (opts: { to: string; params: { type: string; id: string } }) => void;
};

function EntryCard({
    entry,
    isTrash,
    type,
    canDelete,
    onRestore,
    onConfirmDelete,
    onDuplicate,
    gridFields,
    navigate,
    rowLabels,
}: EntryCardProps): React.ReactElement {
    const { t } = useTranslation();
    const items = buildRowItems({
        entry,
        isTrash,
        type,
        canDelete,
        onRestore,
        onConfirmDelete,
        onDuplicate,
        rowLabels,
    });
    const { onContextMenu, contextMenuNode } = useContextMenu(items);

    function handleCardClick() {
        if (isTrash) return;
        void navigate({
            to: '/entries/$type/$id',
            params: { type, id: entry.id },
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
                    <span className="am-collection-card-title am-text-muted">
                        {entry.title}
                    </span>
                ) : (
                    <Link
                        to="/entries/$type/$id"
                        params={{ type, id: entry.id }}
                        className="am-collection-card-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {entry.title}
                    </Link>
                )}

                <div className="am-collection-card-meta">
                    <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                </div>

                {gridFields.map((gf) => (
                    <div key={gf.field} className="am-collection-card-field">
                        <span className="am-collection-card-field-label">
                            {gf.label ?? gf.field}
                        </span>
                        <span>
                            {String(
                                (entry.fields as Record<string, unknown>)[gf.field] ?? '—'
                            )}
                        </span>
                    </div>
                ))}
            </div>
            {contextMenuNode}
        </>
    );
}

// ============================================================================
// Page
// ============================================================================

function EntryIndexPage(): React.ReactElement {
    const { type } = useParams({ strict: false }) as { type: string };
    const navigate = useNavigate();
    const { toast } = useToast();
    const { t } = useTranslation();
    const { canCreate, canDelete } = usePermissions();

    const entryTypeConfig = adminConfig.entries[type];
    const single = entryTypeConfig?.single ?? type;
    const plural = entryTypeConfig?.plural ?? type;
    const adminColumns = entryTypeConfig?.adminColumns ?? [];
    const gridFields = entryTypeConfig?.gridFields ?? [];

    const availableViews = entryTypeConfig?.views ?? ['list'];
    const defaultView: ViewMode =
        (entryTypeConfig?.defaultView as ViewMode | undefined) ?? 'list';
    const showViewToggle =
        availableViews.includes('list') && availableViews.includes('grid');

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [page, setPage] = useState(1);

    const [viewMode, setViewMode] = useViewMode(`entry:${type}`, defaultView);

    const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(
        null
    );
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() =>
        readStoredColumns(type, adminColumns)
    );

    const STATUS_LABELS: Record<StatusFilter, string> = {
        all: t('entries.all'),
        draft: t('entries.draft'),
        published: t('entries.published'),
        scheduled: t('entries.scheduled'),
        trashed: t('entries.trashed'),
    };

    const STATUS_FILTER_OPTIONS = (Object.keys(STATUS_LABELS) as StatusFilter[]).map((s) => ({
        value: s,
        label: STATUS_LABELS[s],
    }));

    const rowLabels = {
        edit: t('entries.rowEdit'),
        duplicate: t('entries.rowDuplicate'),
        moveToTrash: t('entries.rowMoveToTrash'),
        restore: t('common.restore'),
        deletePermanently: t('entries.rowDeletePermanently'),
    };

    useEffect(() => {
        setVisibleColumns(readStoredColumns(type, adminColumns));
    }, [type]);

    const isTrash = statusFilter === 'trashed';

    // Fetch entries (normal or trashed)
    const { data: listData, isLoading } = useEntriesQuery({
        type,
        ...(statusFilter === 'trashed' ? { trashed: true } : statusFilter !== 'all' ? { where: { status: statusFilter } } : {}),
        page,
        limit: PER_PAGE,
        search,
        ...(sort ? { sort: { [sort.key]: sort.direction } } : {}),
    });

    const entries = listData?.data ?? [];
    const pagination = listData?.pagination;
    const totalPages = pagination?.pages ?? 1;
    const totalItems = pagination?.total ?? 0;

    const sortedEntries = React.useMemo(() => {
        if (!sort) return entries;
        return [...entries].sort((a, b) => {
            let aVal: unknown;
            let bVal: unknown;
            if (sort.key === 'title') {
                aVal = a.title;
                bVal = b.title;
            } else if (sort.key === 'updatedAt') {
                aVal = a.updatedAt;
                bVal = b.updatedAt;
            } else {
                aVal = (a.fields as Record<string, unknown>)[sort.key];
                bVal = (b.fields as Record<string, unknown>)[sort.key];
            }
            const aStr = String(aVal ?? '');
            const bStr = String(bVal ?? '');
            return sort.direction === 'asc'
                ? aStr.localeCompare(bStr)
                : bStr.localeCompare(aStr);
        });
    }, [entries, sort]);

    const { checkedIds, toggle, toggleAll, allChecked, someChecked, reset } =
        useSelection(sortedEntries);
    const confirm = useConfirm();

    // Translation counts — only when entry type has translatable enabled
    const hasI18n = entryTypeConfig?.translatable === true;
    const translationQueries = useQueries({
        queries: sortedEntries.map((entry) => ({
            queryKey: ['entry-translations', type, entry.id],
            queryFn: () => Astromech.entries.translations(entry.id),
            enabled: hasI18n,
        })),
    });
    // Map entryId -> translation count
    const translationCountMap = React.useMemo(() => {
        const map = new Map<string, number>();
        if (!hasI18n) return map;
        sortedEntries.forEach((entry, i) => {
            const result = translationQueries[i];
            if (result?.data != null) {
                map.set(entry.id, result.data.length);
            }
        });
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasI18n, sortedEntries, translationQueries]);

    // Mutations
    const trashMutation = useTrashEntry(type);
    const deleteMutation = useDeleteEntry(type);
    const duplicateMutation = useDuplicateEntry(type, {
        onSuccess: (entry) => {
            void navigate({
                to: '/entries/$type/$id',
                params: { type, id: entry.id },
            });
        },
    });
    const restoreMutation = useRestoreEntry(type);
    const bulkPublishMutation = useBulkPublishEntries(type, { onSuccess: reset });
    const bulkUnpublishMutation = useBulkUnpublishEntries(type, { onSuccess: reset });
    const bulkTrashMutation = useBulkTrashEntries(type, { onSuccess: reset });
    const bulkForceDeleteMutation = useBulkDeleteEntries(type, { onSuccess: reset });

    function handleBulkAction(action: BulkAction) {
        const ids = Array.from(checkedIds);
        if (ids.length === 0) return;
        if (action === 'publish') bulkPublishMutation.mutate(ids);
        if (action === 'unpublish') bulkUnpublishMutation.mutate(ids);
        if (action === 'trash') bulkTrashMutation.mutate(ids);
        if (action === 'delete') bulkForceDeleteMutation.mutate(ids);
        if (action === 'restore') {
            void Promise.all(ids.map((id) => restoreMutation.mutateAsync(id))).then(
                () => {
                    reset();
                    toast({ message: t('entries.bulkRestored'), variant: 'success' });
                }
            );
        }
    }

    function handleSort(key: string, direction: SortDirection) {
        if (direction === null) {
            setSort(null);
        } else {
            setSort({ key, direction });
        }
    }

    function toggleColumn(key: string) {
        setVisibleColumns((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            writeStoredColumns(type, next);
            return next;
        });
    }

    const colSpan =
        2 +
        (visibleColumns.has('status') ? 1 : 0) +
        (visibleColumns.has('slug') ? 1 : 0) +
        adminColumns.filter((c) => visibleColumns.has(c.field)).length +
        (visibleColumns.has('updatedAt') ? 1 : 0) +
        1;

    // Shared row action handlers (stable references via mutation objects)
    function handleRestore(id: string) {
        restoreMutation.mutate(id);
    }

    function handleConfirmDelete(id: string, force: boolean) {
        confirm({
            title: force
                ? t('entries.confirmForceDeleteTitle')
                : t('entries.confirmDeleteTitle'),
            description: force
                ? t('entries.confirmForceDeleteMessage')
                : t('entries.confirmDeleteMessage', { name: single.toLowerCase() }),
            variant: 'danger',
            confirmLabel: force
                ? t('entries.confirmForceDeleteLabel')
                : t('entries.confirmDeleteLabel'),
            onConfirm: () => {
                if (force) {
                    deleteMutation.mutate(id);
                } else {
                    trashMutation.mutate(id);
                }
            },
        });
    }

    function handleDuplicate(id: string) {
        duplicateMutation.mutate(id);
    }

    const navigateCompat = useCallback(
        (opts: { to: string; params: { type: string; id: string } }) => {
            void navigate({
                to: '/entries/$type/$id',
                params: { type: opts.params.type, id: opts.params.id },
            });
        },
        [navigate]
    );

    return (
        <>
            <Page>
                <PageHeader>
                    <PageTitle>{plural}</PageTitle>
                    {canCreate(type) && (
                        <Link to="/entries/$type/new" params={{ type }}>
                            <Button icon={<PlusIcon size={16} />}>
                                {t('entries.new', { name: single })}
                            </Button>
                        </Link>
                    )}
                </PageHeader>

                <PageContent>
                    <Toolbar>
                        <ToolbarStart>
                            {someChecked && canDelete(type) && (
                                <Dropdown
                                    label={`${t('media.bulkActions')} (${checkedIds.size})`}
                                    variant="secondary"
                                    align="start"
                                    items={[
                                        {
                                            label: t('media.bulkDeleteButton'),
                                            icon: <Trash2 size={14} />,
                                            variant: 'danger',
                                            onClick: () => {
                                                const ids = Array.from(checkedIds);
                                                confirm({
                                                    title: t('media.bulkDeleteTitle', {
                                                        count: ids.length,
                                                    }),
                                                    description: t(
                                                        'media.bulkDeleteDescription'
                                                    ),
                                                    confirmLabel: t('common.delete'),
                                                    onConfirm: () =>
                                                        handleBulkAction('delete'),
                                                });
                                            },
                                        },
                                    ]}
                                />
                            )}

                            {/* Search */}
                            <SearchInput
                                placeholder={t('entries.searchPlaceholder', {
                                    name: plural.toLowerCase(),
                                })}
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setPage(1);
                                }}
                            />

                            {/* Status filter */}
                            <Select
                                value={statusFilter}
                                onValueChange={(v) => {
                                    setStatusFilter((v ?? 'all') as StatusFilter);
                                    setPage(1);
                                    reset();
                                }}
                                options={STATUS_FILTER_OPTIONS}
                                triggerPrefix={t('entries.statusFilterPrefix')}
                            />
                        </ToolbarStart>

                        <ToolbarEnd>
                            {/* Columns visibility */}
                            <Menu.Root>
                                <Menu.Trigger
                                    className="am-btn am-btn-secondary am-btn-md am-btn-icon"
                                    aria-label={t('entries.toggleColumns')}
                                >
                                    <SlidersHorizontal size={14} />
                                </Menu.Trigger>
                                <Menu.Portal>
                                    <Menu.Positioner
                                        className="am-dropdown-positioner"
                                        sideOffset={4}
                                        align="end"
                                    >
                                        <Menu.Popup className="am-dropdown-popup">
                                            {[
                                                {
                                                    key: 'title',
                                                    label: t('entries.columnTitle'),
                                                },
                                                {
                                                    key: 'status',
                                                    label: t('entries.columnStatus'),
                                                },
                                                {
                                                    key: 'slug',
                                                    label: t('entries.columnSlug'),
                                                },
                                                ...adminColumns.map((c) => ({
                                                    key: c.field,
                                                    label: c.label ?? c.field,
                                                })),
                                                {
                                                    key: 'updatedAt',
                                                    label: t('entries.columnUpdated'),
                                                },
                                            ].map((col) => (
                                                <Menu.Item
                                                    key={col.key}
                                                    className="am-dropdown-item"
                                                    onClick={() => toggleColumn(col.key)}
                                                >
                                                    <span className="am-dropdown-item-icon">
                                                        {visibleColumns.has(col.key) ? (
                                                            <Check size={14} />
                                                        ) : (
                                                            <span style={{ width: 14 }} />
                                                        )}
                                                    </span>
                                                    {col.label}
                                                </Menu.Item>
                                            ))}
                                        </Menu.Popup>
                                    </Menu.Positioner>
                                </Menu.Portal>
                            </Menu.Root>
                            {showViewToggle && (
                                <ToggleGroup
                                    value={viewMode}
                                    onValueChange={setViewMode}
                                    items={[
                                        {
                                            value: 'grid',
                                            icon: <LayoutGrid size={15} />,
                                            label: t('common.gridView'),
                                        },
                                        {
                                            value: 'list',
                                            icon: <LayoutList size={15} />,
                                            label: t('common.listView'),
                                        },
                                    ]}
                                />
                            )}
                        </ToolbarEnd>
                    </Toolbar>

                    {/* Grid view */}
                    {viewMode === 'grid' && (
                        <>
                            {isLoading ? (
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        padding: '2rem',
                                    }}
                                >
                                    <Spinner />
                                </div>
                            ) : entries.length === 0 ? (
                                <EmptyState
                                    title={t('entries.empty', {
                                        name: plural.toLowerCase(),
                                    })}
                                    description={
                                        search
                                            ? t('entries.emptySearch')
                                            : isTrash
                                              ? t('entries.emptyTrash')
                                              : t('entries.emptyCreate', {
                                                    name: single.toLowerCase(),
                                                })
                                    }
                                    action={
                                        !isTrash && !search ? (
                                            <Link
                                                to="/entries/$type/new"
                                                params={{ type }}
                                            >
                                                <Button size="sm">
                                                    {t('entries.new', {
                                                        name: single,
                                                    })}
                                                </Button>
                                            </Link>
                                        ) : undefined
                                    }
                                />
                            ) : (
                                <div className="am-collection-grid">
                                    {sortedEntries.map((entry) => (
                                        <EntryCard
                                            key={entry.id}
                                            entry={entry}
                                            isTrash={isTrash}
                                            type={type}
                                            canDelete={canDelete(type)}
                                            onRestore={handleRestore}
                                            onConfirmDelete={handleConfirmDelete}
                                            onDuplicate={handleDuplicate}
                                            gridFields={gridFields}
                                            navigate={navigateCompat}
                                            rowLabels={rowLabels}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* List (table) view */}
                    {viewMode === 'list' && (
                        <Table.Root>
                            <Table.Head>
                                <Table.Row>
                                    <Table.Th style={{ width: '2.5rem' }}>
                                        <Checkbox
                                            checked={allChecked}
                                            onChange={() => toggleAll()}
                                        />
                                    </Table.Th>
                                    {visibleColumns.has('title') && (
                                        <Table.SortTh
                                            sortKey="title"
                                            currentSort={sort}
                                            onSort={handleSort}
                                        >
                                            {t('entries.columnTitle')}
                                        </Table.SortTh>
                                    )}
                                    {visibleColumns.has('status') && (
                                        <Table.Th>
                                            {t('entries.columnStatus')}
                                        </Table.Th>
                                    )}
                                    {visibleColumns.has('slug') && (
                                        <Table.Th>{t('entries.columnSlug')}</Table.Th>
                                    )}
                                    {adminColumns
                                        .filter((c) => visibleColumns.has(c.field))
                                        .map((col) =>
                                            col.sortable ? (
                                                <Table.SortTh
                                                    key={col.field}
                                                    sortKey={col.field}
                                                    currentSort={sort}
                                                    onSort={handleSort}
                                                >
                                                    {col.label ?? col.field}
                                                </Table.SortTh>
                                            ) : (
                                                <Table.Th key={col.field}>
                                                    {col.label ?? col.field}
                                                </Table.Th>
                                            )
                                        )}
                                    {visibleColumns.has('updatedAt') && (
                                        <Table.SortTh
                                            sortKey="updatedAt"
                                            currentSort={sort}
                                            onSort={handleSort}
                                        >
                                            {t('entries.columnUpdated')}
                                        </Table.SortTh>
                                    )}
                                    <Table.Th style={{ width: '3rem' }} />
                                </Table.Row>
                            </Table.Head>
                            <Table.Body>
                                {isLoading ? (
                                    <Table.Empty colSpan={colSpan}>
                                        <Spinner />
                                    </Table.Empty>
                                ) : entries.length === 0 ? (
                                    <Table.Empty colSpan={colSpan}>
                                        <EmptyState
                                            title={t('entries.empty', {
                                                name: plural.toLowerCase(),
                                            })}
                                            description={
                                                search
                                                    ? t('entries.emptySearch')
                                                    : isTrash
                                                      ? t('entries.emptyTrash')
                                                      : t('entries.emptyCreate', {
                                                            name: single.toLowerCase(),
                                                        })
                                            }
                                            action={
                                                !isTrash && !search ? (
                                                    <Link
                                                        to="/entries/$type/new"
                                                        params={{ type }}
                                                    >
                                                        <Button size="sm">
                                                            {t('entries.new', {
                                                                name: single,
                                                            })}
                                                        </Button>
                                                    </Link>
                                                ) : undefined
                                            }
                                        />
                                    </Table.Empty>
                                ) : (
                                    sortedEntries.map((entry) => (
                                        <EntryTableRow
                                            key={entry.id}
                                            entry={entry}
                                            isTrash={isTrash}
                                            type={type}
                                            canDelete={canDelete(type)}
                                            onRestore={handleRestore}
                                            onConfirmDelete={handleConfirmDelete}
                                            onDuplicate={handleDuplicate}
                                            selected={checkedIds.has(entry.id)}
                                            onToggleSelect={toggle}
                                            adminColumns={adminColumns}
                                            navigate={navigateCompat}
                                            visibleColumns={visibleColumns}
                                            rowLabels={rowLabels}
                                            translationCount={translationCountMap.get(
                                                entry.id
                                            )}
                                        />
                                    ))
                                )}
                            </Table.Body>
                        </Table.Root>
                    )}

                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPage={setPage}
                        totalItems={totalItems}
                    />
                </PageContent>
            </Page>
        </>
    );
}

export const Route = createFileRoute('/_protected/entries/$type/')({
	component: EntryIndexPage,
});
