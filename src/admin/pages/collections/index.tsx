/**
 * Collection entry list page.
 *
 * Shows a searchable, filterable, paginated table or grid of entries for a
 * collection. Supports bulk selection and row-level actions (edit, duplicate,
 * trash/restore). Per-collection view preference is persisted to localStorage.
 */

import { formatDate } from '@/support/dates.js';
import { Menu } from '@base-ui/react/menu';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
    Check,
    ChevronDown,
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
import { Astromech } from '../../../sdk/client/index.js';
import type { Entry } from '../../../types/index.js';
import type { DropdownItem } from '../../components/ui/dropdown.js';
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
    Spinner,
    Table,
    ToggleGroup,
    Toolbar,
    ToolbarLeft,
    ToolbarRight,
    useConfirm,
    useContextMenu,
    useToast,
} from '../../components/ui/index.js';
import type { SortDirection } from '../../components/ui/table.js';
import { useSelection, useViewMode, usePermissions } from '../../hooks/index.js';
import { queryKeys } from '../../hooks/use-query-keys.js';

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

function colStorageKey(collection: string): string {
    return `am-cols-${collection}`;
}

function readStoredColumns(
    collection: string,
    adminCols: { field: string }[]
): Set<string> {
    try {
        const stored = localStorage.getItem(colStorageKey(collection));
        if (stored) {
            const parsed = JSON.parse(stored) as string[];
            if (Array.isArray(parsed)) return new Set(parsed);
        }
    } catch {
        // ignore
    }
    return new Set([...ALL_COLUMNS, ...adminCols.map((c) => c.field)]);
}

function writeStoredColumns(collection: string, cols: Set<string>): void {
    try {
        localStorage.setItem(colStorageKey(collection), JSON.stringify(Array.from(cols)));
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
    collection: string;
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
        collection,
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
            href: `/collections/${collection}/${entry.id}`,
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
    navigate: (opts: { to: string; params: { collection: string; id: string } }) => void;
    visibleColumns: Set<string>;
    translationCount?: number | undefined;
};

function EntryTableRow({
    entry,
    isTrash,
    collection,
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
        collection,
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
                                  to: '/collections/$collection/$id',
                                  params: { collection, id: entry.id },
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
                                    to="/collections/$collection/$id"
                                    params={{ collection, id: entry.id }}
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
    navigate: (opts: { to: string; params: { collection: string; id: string } }) => void;
};

function EntryCard({
    entry,
    isTrash,
    collection,
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
        collection,
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
            to: '/collections/$collection/$id',
            params: { collection, id: entry.id },
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
                    className="am-collection-card__actions"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Dropdown
                        icon={<MoreHorizontalIcon size={16} />}
                        ariaLabel={t('common.actions')}
                        items={items}
                    />
                </div>

                {isTrash ? (
                    <span className="am-collection-card__title am-text-muted">
                        {entry.title}
                    </span>
                ) : (
                    <Link
                        to="/collections/$collection/$id"
                        params={{ collection, id: entry.id }}
                        className="am-collection-card__title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {entry.title}
                    </Link>
                )}

                <div className="am-collection-card__meta">
                    <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                </div>

                {gridFields.map((gf) => (
                    <div key={gf.field} className="am-collection-card__field">
                        <span className="am-collection-card__field-label">
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

export function CollectionIndexPage(): React.ReactElement {
    const { collection } = useParams({ strict: false }) as { collection: string };
    const navigate = useNavigate();
    const { toast } = useToast();
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { canCreate, canDelete } = usePermissions();

    // collection is a valid router param — always present in configured collections
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const api = Astromech.collections[collection]!;

    const collectionConfig = adminConfig.collections[collection];
    const single = collectionConfig?.single ?? collection;
    const plural = collectionConfig?.plural ?? collection;
    const adminColumns = collectionConfig?.adminColumns ?? [];
    const gridFields = collectionConfig?.gridFields ?? [];

    const availableViews = collectionConfig?.views ?? ['list'];
    const defaultView: ViewMode =
        (collectionConfig?.defaultView as ViewMode | undefined) ?? 'list';
    const showViewToggle =
        availableViews.includes('list') && availableViews.includes('grid');

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [page, setPage] = useState(1);
    // const [view, setView] = useState<ViewMode>(() =>
    //     readStoredView(collection, defaultView)
    // );

    const [viewMode, setViewMode] = useViewMode(`collection:${collection}`, defaultView);

    const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(
        null
    );
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() =>
        readStoredColumns(collection, adminColumns)
    );

    const STATUS_LABELS: Record<StatusFilter, string> = {
        all: t('collections.all'),
        draft: t('collections.draft'),
        published: t('collections.published'),
        scheduled: t('collections.scheduled'),
        trashed: t('collections.trashed'),
    };

    const rowLabels = {
        edit: t('collections.rowEdit'),
        duplicate: t('collections.rowDuplicate'),
        moveToTrash: t('collections.rowMoveToTrash'),
        restore: t('common.restore'),
        deletePermanently: t('collections.rowDeletePermanently'),
    };

    useEffect(() => {
        setVisibleColumns(readStoredColumns(collection, adminColumns));
    }, [collection]);

    const isTrash = statusFilter === 'trashed';

    // Fetch entries (normal or trashed)
    const { data: listData, isLoading } = useQuery({
        queryKey: queryKeys.entries.list(collection, {
            statusFilter,
            page,
            search,
            sort,
        }),
        queryFn: async () => {
            if (isTrash) {
                const items = await api.trashed();
                return {
                    data: items,
                    pagination: {
                        total: items.length,
                        page: 1,
                        perPage: items.length,
                        totalPages: 1,
                    },
                };
            }
            return api.paginate(PER_PAGE, page);
        },
    });

    const entries = listData?.data ?? [];
    const pagination = listData?.pagination;
    const totalPages = pagination?.totalPages ?? 1;
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

    // Translation counts — only when collection has translatable enabled
    const hasI18n = collectionConfig?.translatable === true;
    const translationQueries = useQueries({
        queries: sortedEntries.map((entry) => ({
            queryKey: ['entry-translations', collection, entry.id],
            queryFn: () => Astromech.collections[collection]!.translations(entry.id),
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
    const trashMutation = useMutation({
        mutationFn: ({ id }: { id: string }) => api.trash(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(collection),
            });
            toast({
                message: t('collections.movedToTrash', { name: single }),
                variant: 'success',
            });
        },
        onError: (err) => {
            toast({
                message:
                    err instanceof Error ? err.message : t('collections.deleteFailed'),
                variant: 'error',
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: ({ id }: { id: string }) => api.delete(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(collection),
            });
            toast({
                message: t('collections.permanentlyDeleted', { name: single }),
                variant: 'success',
            });
        },
        onError: (err) => {
            toast({
                message:
                    err instanceof Error ? err.message : t('collections.deleteFailed'),
                variant: 'error',
            });
        },
    });

    const duplicateMutation = useMutation({
        mutationFn: ({ id }: { id: string }) => api.duplicate(id),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(collection),
            });
            toast({
                message: t('collections.duplicated', { name: single }),
                variant: 'success',
            });
            void navigate({
                to: '/collections/$collection/$id',
                params: { collection, id: entry.id },
            });
        },
        onError: (err) => {
            toast({
                message:
                    err instanceof Error ? err.message : t('collections.duplicateFailed'),
                variant: 'error',
            });
        },
    });

    const restoreMutation = useMutation({
        mutationFn: ({ id }: { id: string }) => api.restore(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(collection),
            });
            toast({
                message: t('collections.restored', { name: single }),
                variant: 'success',
            });
        },
        onError: (err) => {
            toast({
                message:
                    err instanceof Error ? err.message : t('collections.restoreFailed'),
                variant: 'error',
            });
        },
    });

    // Bulk mutations
    const bulkPublishMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            await Promise.all(ids.map((id) => api.update(id, { status: 'published' })));
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(collection),
            });
            reset();
            toast({ message: t('collections.bulkPublished'), variant: 'success' });
        },
    });

    const bulkUnpublishMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            await Promise.all(ids.map((id) => api.update(id, { status: 'draft' })));
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(collection),
            });
            reset();
            toast({ message: t('collections.bulkUnpublished'), variant: 'success' });
        },
    });

    const bulkTrashMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            await Promise.all(ids.map((id) => api.trash(id)));
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(collection),
            });
            reset();
            toast({ message: t('collections.bulkTrashed'), variant: 'success' });
        },
    });

    const bulkForceDeleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            await Promise.all(ids.map((id) => api.delete(id)));
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(collection),
            });
            reset();
            toast({ message: t('collections.bulkDeleted'), variant: 'success' });
        },
    });

    function handleBulkAction(action: BulkAction) {
        const ids = Array.from(checkedIds);
        if (ids.length === 0) return;
        if (action === 'publish') bulkPublishMutation.mutate(ids);
        if (action === 'unpublish') bulkUnpublishMutation.mutate(ids);
        if (action === 'trash') bulkTrashMutation.mutate(ids);
        if (action === 'delete') bulkForceDeleteMutation.mutate(ids);
        if (action === 'restore') {
            void Promise.all(ids.map((id) => restoreMutation.mutateAsync({ id }))).then(
                () => {
                    void queryClient.invalidateQueries({
                        queryKey: queryKeys.entries.all(collection),
                    });
                    reset();
                    toast({ message: t('collections.bulkRestored'), variant: 'success' });
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
            writeStoredColumns(collection, next);
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
        restoreMutation.mutate({ id });
    }

    function handleConfirmDelete(id: string, force: boolean) {
        confirm({
            title: force
                ? t('collections.confirmForceDeleteTitle')
                : t('collections.confirmDeleteTitle'),
            description: force
                ? t('collections.confirmForceDeleteMessage')
                : t('collections.confirmDeleteMessage', { name: single.toLowerCase() }),
            variant: 'danger',
            confirmLabel: force
                ? t('collections.confirmForceDeleteLabel')
                : t('collections.confirmDeleteLabel'),
            onConfirm: () => {
                if (force) {
                    deleteMutation.mutate({ id });
                } else {
                    trashMutation.mutate({ id });
                }
            },
        });
    }

    function handleDuplicate(id: string) {
        duplicateMutation.mutate({ id });
    }

    const navigateCompat = useCallback(
        (opts: { to: string; params: { collection: string; id: string } }) => {
            void navigate({
                to: '/collections/$collection/$id',
                params: { collection: opts.params.collection, id: opts.params.id },
            });
        },
        [navigate]
    );

    return (
        <>
            <Page>
                <PageHeader>
                    <PageTitle>{plural}</PageTitle>
                    {canCreate(collection) && (
                        <Link to="/collections/$collection/new" params={{ collection }}>
                            <Button icon={<PlusIcon size={16} />}>
                                {t('collections.new', { name: single })}
                            </Button>
                        </Link>
                    )}
                </PageHeader>

                <PageContent>
                    <Toolbar>
                        <ToolbarLeft>
                            {someChecked && canDelete(collection) && (
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
                            {/* Bulk actions — only when rows are selected */}
                            {/* {someChecked && (
                                <Dropdown
                                    label={`${t('collections.bulkActions')} (${checkedIds.size})`}
                                    variant="secondary"
                                    size="sm"
                                    align="start"
                                    items={
                                        isTrash
                                            ? [
                                                  {
                                                      label: t(
                                                          'collections.bulkRestoreSelected'
                                                      ),
                                                      icon: <RotateCcw size={14} />,
                                                      onClick: () =>
                                                          handleBulkAction('restore'),
                                                  },
                                                  {
                                                      label: t(
                                                          'collections.bulkDeletePermanently'
                                                      ),
                                                      icon: <Trash2 size={14} />,
                                                      variant: 'danger',
                                                      onClick: () =>
                                                          handleBulkAction('delete'),
                                                  },
                                              ]
                                            : [
                                                  {
                                                      label: t(
                                                          'collections.bulkPublishSelected'
                                                      ),
                                                      icon: <Globe size={14} />,
                                                      onClick: () =>
                                                          handleBulkAction('publish'),
                                                  },
                                                  {
                                                      label: t(
                                                          'collections.bulkUnpublishSelected'
                                                      ),
                                                      icon: <EyeOff size={14} />,
                                                      onClick: () =>
                                                          handleBulkAction('unpublish'),
                                                  },
                                                  {
                                                      label: t(
                                                          'collections.bulkMoveToTrash'
                                                      ),
                                                      icon: <Trash2 size={14} />,
                                                      variant: 'danger',
                                                      onClick: () =>
                                                          handleBulkAction('trash'),
                                                  },
                                              ]
                                    }
                                />
                            )} */}

                            {/* Search */}
                            <SearchInput
                                placeholder={t('collections.searchPlaceholder', {
                                    name: plural.toLowerCase(),
                                })}
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setPage(1);
                                }}
                            />

                            {/* Status filter */}
                            <Menu.Root>
                                <Menu.Trigger className="am-toolbar__filter-btn">
                                    {t('collections.statusFilter', {
                                        status: STATUS_LABELS[statusFilter],
                                    })}
                                    <ChevronDown size={12} />
                                </Menu.Trigger>
                                <Menu.Portal>
                                    <Menu.Positioner
                                        className="am-dropdown__positioner"
                                        sideOffset={4}
                                    >
                                        <Menu.Popup className="am-dropdown__popup">
                                            {(
                                                [
                                                    'all',
                                                    'draft',
                                                    'published',
                                                    'scheduled',
                                                ] as StatusFilter[]
                                            ).map((s) => (
                                                <Menu.Item
                                                    key={s}
                                                    className="am-dropdown__item"
                                                    onClick={() => {
                                                        setStatusFilter(s);
                                                        setPage(1);
                                                        reset();
                                                    }}
                                                >
                                                    <span className="am-dropdown__item-icon">
                                                        {statusFilter === s ? (
                                                            <Check size={14} />
                                                        ) : (
                                                            <span style={{ width: 14 }} />
                                                        )}
                                                    </span>
                                                    {STATUS_LABELS[s]}
                                                </Menu.Item>
                                            ))}
                                            <div className="am-dropdown__separator" />
                                            <Menu.Item
                                                className="am-dropdown__item"
                                                onClick={() => {
                                                    setStatusFilter('trashed');
                                                    setPage(1);
                                                    reset();
                                                }}
                                            >
                                                <span className="am-dropdown__item-icon">
                                                    {statusFilter === 'trashed' ? (
                                                        <Check size={14} />
                                                    ) : (
                                                        <span style={{ width: 14 }} />
                                                    )}
                                                </span>
                                                {STATUS_LABELS['trashed']}
                                            </Menu.Item>
                                        </Menu.Popup>
                                    </Menu.Positioner>
                                </Menu.Portal>
                            </Menu.Root>
                        </ToolbarLeft>

                        <ToolbarRight>
                            {/* Columns visibility */}
                            <Menu.Root>
                                <Menu.Trigger
                                    className="am-btn am-btn--secondary am-btn--md am-btn--icon"
                                    aria-label={t('collections.toggleColumns')}
                                >
                                    <SlidersHorizontal size={14} />
                                </Menu.Trigger>
                                <Menu.Portal>
                                    <Menu.Positioner
                                        className="am-dropdown__positioner"
                                        sideOffset={4}
                                        align="end"
                                    >
                                        <Menu.Popup className="am-dropdown__popup">
                                            {[
                                                {
                                                    key: 'title',
                                                    label: t('collections.columnTitle'),
                                                },
                                                {
                                                    key: 'status',
                                                    label: t('collections.columnStatus'),
                                                },
                                                {
                                                    key: 'slug',
                                                    label: t('collections.columnSlug'),
                                                },
                                                ...adminColumns.map((c) => ({
                                                    key: c.field,
                                                    label: c.label ?? c.field,
                                                })),
                                                {
                                                    key: 'updatedAt',
                                                    label: t('collections.columnUpdated'),
                                                },
                                            ].map((col) => (
                                                <Menu.Item
                                                    key={col.key}
                                                    className="am-dropdown__item"
                                                    onClick={() => toggleColumn(col.key)}
                                                >
                                                    <span className="am-dropdown__item-icon">
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
                        </ToolbarRight>
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
                                    title={t('collections.empty', {
                                        name: plural.toLowerCase(),
                                    })}
                                    description={
                                        search
                                            ? t('collections.emptySearch')
                                            : isTrash
                                              ? t('collections.emptyTrash')
                                              : t('collections.emptyCreate', {
                                                    name: single.toLowerCase(),
                                                })
                                    }
                                    action={
                                        !isTrash && !search ? (
                                            <Link
                                                to="/collections/$collection/new"
                                                params={{ collection }}
                                            >
                                                <Button size="sm">
                                                    {t('collections.new', {
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
                                            collection={collection}
                                            canDelete={canDelete(collection)}
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
                                            {t('collections.columnTitle')}
                                        </Table.SortTh>
                                    )}
                                    {visibleColumns.has('status') && (
                                        <Table.Th>
                                            {t('collections.columnStatus')}
                                        </Table.Th>
                                    )}
                                    {visibleColumns.has('slug') && (
                                        <Table.Th>{t('collections.columnSlug')}</Table.Th>
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
                                            {t('collections.columnUpdated')}
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
                                            title={t('collections.empty', {
                                                name: plural.toLowerCase(),
                                            })}
                                            description={
                                                search
                                                    ? t('collections.emptySearch')
                                                    : isTrash
                                                      ? t('collections.emptyTrash')
                                                      : t('collections.emptyCreate', {
                                                            name: single.toLowerCase(),
                                                        })
                                            }
                                            action={
                                                !isTrash && !search ? (
                                                    <Link
                                                        to="/collections/$collection/new"
                                                        params={{ collection }}
                                                    >
                                                        <Button size="sm">
                                                            {t('collections.new', {
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
                                            collection={collection}
                                            canDelete={canDelete(collection)}
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
