/**
 * Shared entry-type list page body.
 *
 * Parameterized by a single `EntriesSurface` so it serves both root entry
 * types and plugin-namespaced entry types. Columns render through the
 * definition layer: `deriveTableDefinition(config)` builds the ordered column
 * set and each cell is resolved from the cell registry by kind (Phase 4). The
 * page shell — toolbar, filters, bulk actions, view toggle, context menus —
 * stays hand-written and consumes the derived definition.
 *
 * Shows a searchable, filterable, paginated table or grid of entries. Supports
 * bulk selection and row-level actions (edit, duplicate, trash/restore).
 * Per-type view preference is persisted to localStorage.
 */

import { Menu } from '@base-ui/react/menu';
import { useNavigate, useSearch } from '@tanstack/react-router';
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
import type { CellRenderContext, Entry, TableColumn } from '@/types/index.js';
import type { DropdownItem } from '@/admin/components/ui/dropdown.js';
import {
    deriveTableDefinition,
    fieldTypeOf,
    resolveConfigForDerive,
} from '@/admin/definitions/derive.js';
import { defaultCellKind } from '@/admin/definitions/cell-kind-map.js';
import { getCellRenderer } from '@/admin/definitions/cell-registry.js';
import { resolveLabel } from '@/admin/i18n/labels.js';
import { namespaceForScope } from '@/admin/i18n/entry-namespace.js';
import { statusVariant } from '@/admin/definitions/cells/status-variant.js';
import { Link } from '@/admin/definitions/cells/link.js';
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
    useIsMobile,
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
import { DeleteEntryModal } from '@/admin/components/entries/DeleteEntryModal.js';
import { resolveContentLocale } from '@/support/locale.js';
import type { EntriesSurface, EntriesListSearch } from './surface.js';

// ============================================================================
// Types
// ============================================================================

type StatusFilter = 'all' | 'draft' | 'published' | 'scheduled' | 'trashed';

type BulkAction = 'publish' | 'unpublish' | 'trash' | 'delete' | 'restore';

type ViewMode = 'list' | 'grid';

// ============================================================================
// Helpers
// ============================================================================

const ALL_COLUMNS = [
    'title',
    'status',
    'slug',
    'locale',
    'translations',
    'updatedAt',
] as const;
const LOCALE_FILTER_ALL = '__all__';

function colStorageKey(type: string): string {
    return `am-cols-${type}`;
}

function defaultColumns(hasTitle: boolean): readonly string[] {
    return hasTitle ? ALL_COLUMNS : ALL_COLUMNS.filter((c) => c !== 'title');
}

function readStoredColumns(
    type: string,
    adminCols: { field: string }[],
    hasTitle: boolean
): Set<string> {
    try {
        const stored = localStorage.getItem(colStorageKey(type));
        if (stored) {
            const parsed = JSON.parse(stored) as string[];
            if (Array.isArray(parsed)) {
                const cols = new Set(parsed);
                if (!hasTitle) cols.delete('title');
                return cols;
            }
        }
    } catch {
        // ignore
    }
    return new Set([...defaultColumns(hasTitle), ...adminCols.map((c) => c.field)]);
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
            href: `${basePath}/${entry.id}`,
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

// ============================================================================
// Table row with context menu
// ============================================================================

type EntryTableRowProps = RowActionsProps & {
    selected: boolean;
    onToggleSelect: (id: string) => void;
    columns: TableColumn[];
    navigate: (opts: { id: string }) => void;
    configuredLocales: string[];
};

function EntryTableRow({
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
    const ctx: CellRenderContext = { basePath, configuredLocales, isTrash };

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
                            : (entry as unknown as Record<string, unknown>)[col.key];
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

// ============================================================================
// Grid card with context menu
// ============================================================================

type EntryCardProps = RowActionsProps & {
    columns: TableColumn[];
    columnLabel: (col: TableColumn) => string;
    navigate: (opts: { id: string }) => void;
    hasTitle: boolean;
    configuredLocales: string[];
};

function EntryCard({
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
    const ctx: CellRenderContext = { basePath, configuredLocales, isTrash };

    function handleCardClick() {
        if (isTrash) return;
        void navigate({
            id: entry.id,
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
                        to={`${basePath}/${entry.id}`}
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

// ============================================================================
// Page
// ============================================================================

/** Partial URL-search update; an explicit `undefined` value clears that key. */
type EntriesSearchPatch = {
    [K in keyof EntriesListSearch]?: EntriesListSearch[K] | undefined;
};

/** Parse a `${key}:${dir}` URL sort param back into the table's sort shape. */
function parseSortParam(
    raw: string | undefined
): { key: string; direction: 'asc' | 'desc' } | null {
    if (!raw) return null;
    const idx = raw.lastIndexOf(':');
    if (idx === -1) return null;
    const key = raw.slice(0, idx);
    const direction = raw.slice(idx + 1);
    if (!key || (direction !== 'asc' && direction !== 'desc')) return null;
    return { key, direction };
}

export function EntriesListPage({
    surface,
}: {
    surface: EntriesSurface;
}): React.ReactElement {
    const { type, api, cacheScope, config: entryTypeConfig, basePath } = surface;
    const scope = { api, cacheScope };
    const navigate = useNavigate();
    const { toast } = useToast();
    const { t } = useTranslation();
    const ns = namespaceForScope(cacheScope);
    // System columns label via i18n key; admin/grid columns via the Label seam.
    const columnLabel = useCallback(
        (col: TableColumn): string =>
            col.system
                ? t(typeof col.label === 'string' ? col.label : col.label.$t)
                : resolveLabel(col.label, col.key, t, ns),
        [t, ns]
    );
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission(surface.permissionFor('create'));
    const canDelete = hasPermission(surface.permissionFor('delete'));

    const single = entryTypeConfig?.single ?? type;
    const plural = entryTypeConfig?.plural ?? type;
    const adminColumns = entryTypeConfig?.adminColumns ?? [];
    const gridFields = entryTypeConfig?.gridFields ?? [];
    const capabilities = entryTypeConfig?.capabilities;
    const hasStatuses = capabilities?.statuses !== false;
    const hasTrash = capabilities?.trash !== false;
    const hasSlugCap = capabilities?.slug !== false;
    const hasTitle = entryTypeConfig?.titleField !== false;
    const showSearch =
        entryTypeConfig?.titleField !== false ||
        (entryTypeConfig?.search?.length ?? 0) > 0;

    // `deriveTableDefinition` needs a full AdminEntryTypeConfig. When the surface
    // config is undefined (unknown root type), resolveConfigForDerive synthesizes
    // a default reproducing the historical undefined-config behaviour.
    const resolvedConfigForDerive = React.useMemo(
        () => resolveConfigForDerive(entryTypeConfig, type),
        [entryTypeConfig, type]
    );
    const tableDef = React.useMemo(
        () => deriveTableDefinition(resolvedConfigForDerive),
        [resolvedConfigForDerive]
    );

    const availableViews = entryTypeConfig?.views ?? ['list'];
    const defaultView: ViewMode =
        (entryTypeConfig?.defaultView as ViewMode | undefined) ?? 'list';
    const showViewToggle =
        availableViews.includes('list') && availableViews.includes('grid');

    const urlSearch = useSearch({ strict: false }) as EntriesListSearch;

    const hasI18n = capabilities?.translatable === true;
    const configuredLocales = adminConfig.locales;

    // Filter/sort/page state lives in the URL so it survives refresh,
    // back/forward, and link-sharing. `patchSearch` applies a partial change in
    // a single navigation; omitting a key clears it, and clearing `page` resets
    // to the first page.
    const search = urlSearch.q ?? '';
    const statusFilter = (urlSearch.status ?? 'all') as StatusFilter;
    const page = urlSearch.page ?? 1;
    const defaultContentLocale =
        resolveContentLocale(adminConfig.defaultLocale, adminConfig.locales) ??
        adminConfig.locales[0] ??
        adminConfig.defaultLocale;
    const localeFilter = urlSearch.locale ?? defaultContentLocale;
    const sort = parseSortParam(urlSearch.sort);

    const patchSearch = useCallback(
        (patch: EntriesSearchPatch): void => {
            void navigate({
                search: (prev: Record<string, unknown>) => {
                    const next: Record<string, unknown> = { ...prev, ...patch };
                    for (const key of Object.keys(next)) {
                        if (next[key] === undefined) delete next[key];
                    }
                    return next;
                },
            } as unknown as Parameters<typeof navigate>[0]);
        },
        [navigate]
    );

    const isMobile = useIsMobile();
    const mobileDefault: ViewMode = availableViews.includes('grid') ? 'grid' : defaultView;
    const [viewMode, setViewMode] = useViewMode(`entry:${type}`, defaultView, {
        storageKey: isMobile ? `entry:${type}:mobile` : `entry:${type}`,
        defaultView: isMobile ? mobileDefault : defaultView,
    });
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() =>
        readStoredColumns(type, adminColumns, hasTitle)
    );

    const STATUS_LABELS: Record<StatusFilter, string> = {
        all: t('entries.all'),
        draft: t('entries.draft'),
        published: t('entries.published'),
        scheduled: t('entries.scheduled'),
        trashed: t('entries.trashed'),
    };

    const STATUS_FILTER_OPTIONS = (Object.keys(STATUS_LABELS) as StatusFilter[])
        .filter((s) => {
            if (!hasStatuses && (s === 'draft' || s === 'published' || s === 'scheduled'))
                return false;
            if (!hasTrash && s === 'trashed') return false;
            return true;
        })
        .map((s) => ({
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
        setVisibleColumns(readStoredColumns(type, adminColumns, hasTitle));
    }, [type]);

    const isTrash = statusFilter === 'trashed';

    // Fetch entries (normal or trashed)
    const effectiveLocale = hasI18n
        ? localeFilter === LOCALE_FILTER_ALL
            ? 'all'
            : localeFilter
        : 'all';
    const { data: listData, isLoading } = useEntriesQuery(
        {
            type,
            locale: effectiveLocale,
            ...(statusFilter === 'trashed'
                ? { trashed: true }
                : statusFilter !== 'all'
                  ? { where: { status: statusFilter } }
                  : {}),
            page,
            limit: PER_PAGE,
            search,
            ...(sort ? { sort: { [sort.key]: sort.direction } } : {}),
        },
        scope
    );
    const showLocaleColumn = hasI18n && localeFilter === LOCALE_FILTER_ALL;

    // Evaluate a derived column's declarative `requires` gate against the page's
    // runtime capability/visibility flags.
    function capabilityGate(col: TableColumn): boolean {
        switch (col.requires) {
            case 'title':
                return hasTitle;
            case 'statuses':
                return hasStatuses;
            case 'slug':
                return hasSlugCap;
            case 'locale':
                return showLocaleColumn;
            case 'translatable':
                return hasI18n;
            default:
                return true;
        }
    }
    const visibleColumnDefs = tableDef.columns.filter(
        (col) => capabilityGate(col) && visibleColumns.has(col.key)
    );
    const menuColumnDefs = tableDef.columns.filter((col) => capabilityGate(col));

    // Grid card field columns, routed through the cell registry so booleans
    // render consistently with the list view.
    const gridColumnDefs: TableColumn[] = gridFields.map((gf) => ({
        key: gf.field,
        label: gf.label ?? gf.field,
        kind: defaultCellKind(fieldTypeOf(resolvedConfigForDerive, gf.field)),
        source: 'field' as const,
        sortable: false,
        system: false,
    }));

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

    // Mutations
    const trashMutation = useTrashEntry(type, scope);
    const deleteMutation = useDeleteEntry(type, scope);
    const duplicateMutation = useDuplicateEntry(type, {
        ...scope,
        onSuccess: (entry) => {
            void navigate({
                to: `${basePath}/${entry.id}`,
            });
        },
    });
    const restoreMutation = useRestoreEntry(type, scope);
    const bulkPublishMutation = useBulkPublishEntries(type, {
        ...scope,
        onSuccess: reset,
    });
    const bulkUnpublishMutation = useBulkUnpublishEntries(type, {
        ...scope,
        onSuccess: reset,
    });
    const bulkTrashMutation = useBulkTrashEntries(type, { ...scope, onSuccess: reset });
    const bulkForceDeleteMutation = useBulkDeleteEntries(type, {
        ...scope,
        onSuccess: reset,
    });

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
        patchSearch({
            sort: direction === null ? undefined : `${key}:${direction}`,
            page: undefined,
        });
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

    const colSpan = 1 + visibleColumnDefs.length + 1; // checkbox + data columns + actions

    // Delete modal state — drives DeleteEntryModal for both trash and force-delete.
    const [deleteTarget, setDeleteTarget] = useState<{
        entry: Entry;
        force: boolean;
    } | null>(null);

    function handleRestore(id: string) {
        restoreMutation.mutate(id);
    }

    function handleConfirmDelete(id: string, force: boolean) {
        const entry = sortedEntries.find((e) => e.id === id);
        if (!entry) return;
        setDeleteTarget({ entry, force });
    }

    function handleDuplicate(id: string) {
        duplicateMutation.mutate(id);
    }

    const navigateCompat = useCallback(
        (opts: { id: string }) => {
            void navigate({
                to: `${basePath}/${opts.id}`,
            });
        },
        [navigate, basePath]
    );

    function handleDeleteConfirm(options: { cascadeLocales: boolean }) {
        if (!deleteTarget) return;
        const { entry, force } = deleteTarget;
        const input = options.cascadeLocales
            ? { id: entry.id, cascadeLocales: true }
            : entry.id;
        if (force) {
            deleteMutation.mutate(input, { onSuccess: () => setDeleteTarget(null) });
        } else {
            trashMutation.mutate(input, { onSuccess: () => setDeleteTarget(null) });
        }
    }

    return (
        <>
            <DeleteEntryModal
                open={deleteTarget != null}
                entry={deleteTarget?.entry ?? null}
                typeLabel={single}
                force={deleteTarget?.force ?? false}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={handleDeleteConfirm}
                loading={trashMutation.isPending || deleteMutation.isPending}
            />
            <Page>
                <PageHeader>
                    <PageTitle>{plural}</PageTitle>
                    {canCreate && (
                        <Link
                            to={`${basePath}/new`}
                            search={
                                hasI18n && localeFilter !== LOCALE_FILTER_ALL
                                    ? { locale: localeFilter }
                                    : {}
                            }
                        >
                            <Button icon={<PlusIcon size={16} />}>
                                {t('entries.new', { name: single })}
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
                                    items={[
                                        ...(hasStatuses && !isTrash
                                            ? [
                                                  {
                                                      label: t(
                                                          'entries.bulkPublishSelected'
                                                      ),
                                                      icon: <Check size={14} />,
                                                      onClick: () =>
                                                          handleBulkAction('publish'),
                                                  },
                                                  {
                                                      label: t(
                                                          'entries.bulkUnpublishSelected'
                                                      ),
                                                      icon: <RotateCcw size={14} />,
                                                      onClick: () =>
                                                          handleBulkAction('unpublish'),
                                                  },
                                              ]
                                            : []),
                                        ...(hasTrash && !isTrash
                                            ? [
                                                  {
                                                      label: t('entries.bulkMoveToTrash'),
                                                      icon: <Trash2 size={14} />,
                                                      variant: 'danger' as const,
                                                      onClick: () =>
                                                          handleBulkAction('trash'),
                                                  },
                                              ]
                                            : []),
                                        ...(isTrash && hasTrash
                                            ? [
                                                  {
                                                      label: t(
                                                          'entries.bulkRestoreSelected'
                                                      ),
                                                      icon: <RotateCcw size={14} />,
                                                      onClick: () =>
                                                          handleBulkAction('restore'),
                                                  },
                                              ]
                                            : []),
                                        {
                                            label: t('media.bulkDeleteButton'),
                                            icon: <Trash2 size={14} />,
                                            variant: 'danger' as const,
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

                            {/* Search — shown for titled types, or titleless types
                                that declare searchable fields. */}
                            {showSearch && (
                                <SearchInput
                                    placeholder={t('entries.searchPlaceholder', {
                                        name: plural.toLowerCase(),
                                    })}
                                    value={search}
                                    onChange={(e) => {
                                        patchSearch({
                                            q: e.target.value || undefined,
                                            page: undefined,
                                        });
                                    }}
                                />
                            )}

                            {/* Status filter — only when statuses or trash capabilities are on */}
                            {(hasStatuses || hasTrash) && (
                                <Select
                                    value={statusFilter}
                                    onValueChange={(v) => {
                                        patchSearch({
                                            status: v && v !== 'all' ? v : undefined,
                                            page: undefined,
                                        });
                                        reset();
                                    }}
                                    options={STATUS_FILTER_OPTIONS}
                                    triggerPrefix={t('entries.statusFilterPrefix')}
                                />
                            )}

                            {/* Locale filter (only when translatable) */}
                            {hasI18n && (
                                <Select
                                    value={localeFilter}
                                    onValueChange={(v) => {
                                        patchSearch({
                                            locale:
                                                v && v !== defaultContentLocale
                                                    ? v
                                                    : undefined,
                                            page: undefined,
                                        });
                                        reset();
                                    }}
                                    options={[
                                        ...configuredLocales.map((loc) => ({
                                            value: loc,
                                            label: loc.toUpperCase(),
                                        })),
                                        {
                                            value: LOCALE_FILTER_ALL,
                                            label: t('entries.allLocales'),
                                        },
                                    ]}
                                    triggerPrefix={t('entries.localeFilterPrefix')}
                                />
                            )}
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
                                            {menuColumnDefs
                                                .map((col) => ({
                                                    key: col.key,
                                                    label: columnLabel(col),
                                                }))
                                                .map((col) => (
                                                    <Menu.Item
                                                        key={col.key}
                                                        className="am-dropdown-item"
                                                        onClick={() =>
                                                            toggleColumn(col.key)
                                                        }
                                                    >
                                                        <span className="am-dropdown-item-icon">
                                                            {visibleColumns.has(
                                                                col.key
                                                            ) ? (
                                                                <Check size={14} />
                                                            ) : (
                                                                <span
                                                                    style={{ width: 14 }}
                                                                />
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
                                            <Link to={`${basePath}/new`}>
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
                                            basePath={basePath}
                                            canDelete={canDelete}
                                            hasTrashCap={hasTrash}
                                            onRestore={handleRestore}
                                            onConfirmDelete={handleConfirmDelete}
                                            onDuplicate={handleDuplicate}
                                            columns={gridColumnDefs}
                                            columnLabel={columnLabel}
                                            navigate={navigateCompat}
                                            rowLabels={rowLabels}
                                            hasTitle={hasTitle}
                                            configuredLocales={configuredLocales}
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
                                    {visibleColumnDefs.map((col) =>
                                        col.sortable ? (
                                            <Table.SortTh
                                                key={col.key}
                                                sortKey={col.key}
                                                currentSort={sort}
                                                onSort={handleSort}
                                            >
                                                {columnLabel(col)}
                                            </Table.SortTh>
                                        ) : (
                                            <Table.Th key={col.key}>
                                                {columnLabel(col)}
                                            </Table.Th>
                                        )
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
                                                    <Link to={`${basePath}/new`}>
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
                                            basePath={basePath}
                                            canDelete={canDelete}
                                            hasTrashCap={hasTrash}
                                            onRestore={handleRestore}
                                            onConfirmDelete={handleConfirmDelete}
                                            onDuplicate={handleDuplicate}
                                            selected={checkedIds.has(entry.id)}
                                            onToggleSelect={toggle}
                                            columns={visibleColumnDefs}
                                            navigate={navigateCompat}
                                            rowLabels={rowLabels}
                                            configuredLocales={configuredLocales}
                                        />
                                    ))
                                )}
                            </Table.Body>
                        </Table.Root>
                    )}

                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPage={(p) => patchSearch({ page: p > 1 ? p : undefined })}
                        totalItems={totalItems}
                    />
                </PageContent>
            </Page>
        </>
    );
}
