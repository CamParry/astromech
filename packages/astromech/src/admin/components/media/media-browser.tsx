/**
 * The media library browser: toolbar, grid/list, drop-zone upload, pagination.
 * Query state is owned by the host so the page can keep it in the URL while the
 * field picker keeps it in component state.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, LayoutList } from 'lucide-react';
import {
    Checkbox,
    ContentGrid,
    DropZone,
    EmptyState,
    PageLoading,
    Pagination,
    SearchInput,
    Select,
    Table,
    ToggleGroup,
    Toolbar,
    ToolbarEnd,
    ToolbarStart,
    UploadZone,
} from '@/admin/components/ui/index.js';
import type { SortDirection } from '@/admin/components/ui/table.js';
import { MediaCard } from './MediaCard.js';
import { MediaRow } from './MediaRow.js';
import { useDebounce } from '@/admin/hooks/use-debounce.js';
import { useMediaQuery, useUploadMedia } from '@/admin/hooks/index.js';
import {
    MEDIA_ACCEPT,
    MEDIA_SORT_KEYS,
    TYPE_FILTER_KEYS,
    TYPE_FILTER_VALUES,
} from '@/admin/types/media.js';
import type { MediaSortKey, TypeFilter, ViewMode } from '@/admin/types/media.js';
import type { Media } from '@/types/index.js';

const DEFAULT_PER_PAGE = 20;
const SEARCH_DEBOUNCE_MS = 250;
const SORT_NONE = 'none';

export type MediaBrowserQuery = {
    q: string;
    type: TypeFilter;
    /** Explicitly `| undefined`: clearing a sort passes it, under exactOptionalPropertyTypes. */
    sort?: MediaSortKey | undefined;
    dir?: 'asc' | 'desc' | undefined;
    page: number;
};

export type MediaBrowserSelection =
    | {
          mode: 'bulk';
          checkedIds: Set<string>;
          onToggle: (id: string) => void;
          onToggleAll: () => void;
          allChecked: boolean;
      }
    | {
          mode: 'pick';
          selectedIds: string[];
          onPick: (item: Media) => void;
          multiple: boolean;
      };

export type MediaBrowserProps = {
    query: MediaBrowserQuery;
    onQueryChange: (next: Partial<MediaBrowserQuery>) => void;
    selection: MediaBrowserSelection;
    /** `bulk` mode only — opens the detail modal for a tile or row. */
    onOpenItem?: (id: string) => void;
    /** Omit to force grid; the picker has no view switch. */
    viewMode?: ViewMode;
    onViewModeChange?: (value: ViewMode) => void;
    accept?: string;
    canUpload?: boolean;
    perPage?: number;
    toolbarExtra?: React.ReactNode;
};

export function MediaBrowser({
    query,
    onQueryChange,
    selection,
    onOpenItem,
    viewMode,
    onViewModeChange,
    accept = MEDIA_ACCEPT,
    canUpload = true,
    perPage = DEFAULT_PER_PAGE,
    toolbarExtra,
}: MediaBrowserProps): React.ReactElement {
    const { t } = useTranslation();
    const { upload, isUploading } = useUploadMedia();

    // The input is local so typing stays instant; only the settled value is
    // pushed to the host, which is what the request and any URL are built from.
    const [searchInput, setSearchInput] = useState(query.q);
    const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);

    useEffect(() => {
        if (debouncedSearch === query.q) return;
        onQueryChange({ q: debouncedSearch, page: 1 });
    }, [debouncedSearch, query.q, onQueryChange]);

    const { q, type: typeFilter, sort, dir } = query;
    const currentPage = Math.max(1, query.page);

    const { data, isLoading, isError } = useMediaQuery({
        ...(q ? { search: q } : {}),
        ...(typeFilter !== 'all' ? { where: { mimeType: typeFilter } } : {}),
        ...(sort ? { sort: { [sort]: dir ?? 'asc' } } : {}),
        page: currentPage,
        limit: perPage,
    });

    const items = data?.data ?? [];
    const totalItems = data?.pagination?.total;
    const totalPages = Math.max(1, data?.pagination?.pages ?? 1);

    const activeView: ViewMode = selection.mode === 'pick' ? 'grid' : (viewMode ?? 'grid');
    const uploadMultiple = selection.mode === 'pick' ? selection.multiple : true;
    const currentSort = sort ? { key: sort, direction: dir ?? 'asc' } : null;
    const isFiltered = q !== '' || typeFilter !== 'all';

    function handleTypeChange(value: string | null): void {
        onQueryChange({ type: (value ?? 'all') as TypeFilter, page: 1 });
    }

    function handleSort(key: string, direction: SortDirection): void {
        if (direction === null || !isSortKey(key)) {
            onQueryChange({ sort: undefined, dir: undefined, page: 1 });
            return;
        }
        onQueryChange({ sort: key, dir: direction, page: 1 });
    }

    function handleSortSelect(value: string | null): void {
        const [key = '', direction] = (value ?? '').split(':');
        if (!isSortKey(key)) {
            handleSort(key, null);
            return;
        }
        handleSort(key, direction === 'desc' ? 'desc' : 'asc');
    }

    return (
        <>
            <Toolbar>
                <ToolbarStart>
                    {toolbarExtra}
                    <SearchInput
                        placeholder={t('media.searchPlaceholder')}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                    <Select
                        value={typeFilter}
                        onValueChange={handleTypeChange}
                        options={TYPE_FILTER_VALUES.map((value) => ({
                            value,
                            label: t(TYPE_FILTER_KEYS[value]),
                        }))}
                        triggerPrefix={t('media.typeFilterPrefix')}
                        className="am-select-trigger-auto"
                    />
                    {/* Grid has no column headers to sort by, so it gets a select. */}
                    {activeView === 'grid' && (
                        <Select
                            value={sort ? `${sort}:${dir ?? 'asc'}` : SORT_NONE}
                            onValueChange={handleSortSelect}
                            options={sortOptions(t)}
                            triggerPrefix={t('media.sortPrefix')}
                            className="am-select-trigger-auto"
                        />
                    )}
                </ToolbarStart>

                {viewMode !== undefined && onViewModeChange !== undefined && (
                    <ToolbarEnd>
                        <ToggleGroup
                            value={viewMode}
                            onValueChange={onViewModeChange}
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
                    </ToolbarEnd>
                )}
            </Toolbar>

            {isError ? (
                <EmptyState title={t('media.listFailed')} />
            ) : isLoading ? (
                <PageLoading />
            ) : (
                <DropZone
                    onUpload={upload}
                    accept={accept}
                    multiple={uploadMultiple}
                    overlayLabel={t('media.dropOverlayLabel')}
                    disabled={isUploading || !canUpload}
                >
                    {items.length === 0 ? (
                        isFiltered ? (
                            <EmptyState
                                title={t('media.noResults')}
                                description={
                                    q
                                        ? t('media.noSearchResults', { query: q })
                                        : t('media.noTypeResults', {
                                              type: t(
                                                  TYPE_FILTER_KEYS[typeFilter]
                                              ).toLowerCase(),
                                          })
                                }
                            />
                        ) : canUpload ? (
                            <UploadZone
                                className="am-media-upload-zone-wrap"
                                onUpload={upload}
                                disabled={isUploading}
                                accept={accept}
                                multiple={uploadMultiple}
                                label={t('media.uploadLabel')}
                            />
                        ) : (
                            <EmptyState title={t('media.noResults')} />
                        )
                    ) : (
                        <div aria-busy={isUploading}>
                            {activeView === 'list' && selection.mode === 'bulk' ? (
                                <MediaBrowserList
                                    items={items}
                                    selection={selection}
                                    currentSort={currentSort}
                                    onSort={handleSort}
                                    {...(onOpenItem ? { onOpenItem } : {})}
                                />
                            ) : (
                                <MediaBrowserGrid
                                    items={items}
                                    selection={selection}
                                    {...(onOpenItem ? { onOpenItem } : {})}
                                />
                            )}

                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPage={(page) => onQueryChange({ page })}
                                {...(totalItems !== undefined ? { totalItems } : {})}
                            />
                        </div>
                    )}
                </DropZone>
            )}
        </>
    );
}

type GridProps = {
    items: Media[];
    selection: MediaBrowserSelection;
    onOpenItem?: (id: string) => void;
};

/** Tiles. In `pick` mode a tile is the select action and carries no checkbox. */
function MediaBrowserGrid({ items, selection, onOpenItem }: GridProps): React.ReactElement {
    const { t } = useTranslation();

    if (selection.mode === 'pick') {
        return (
            <ContentGrid.Root>
                {items.map((item) => (
                    <MediaCard
                        key={item.id}
                        item={item}
                        selected={selection.selectedIds.includes(item.id)}
                        onClick={() => selection.onPick(item)}
                    />
                ))}
            </ContentGrid.Root>
        );
    }

    return (
        <>
            <div className="am-media-select-bar">
                <Checkbox
                    checked={selection.allChecked}
                    onChange={selection.onToggleAll}
                    label={t('common.selectAll')}
                />
            </div>
            <ContentGrid.Root>
                {items.map((item) => (
                    <MediaCard
                        key={item.id}
                        item={item}
                        checked={selection.checkedIds.has(item.id)}
                        onToggleCheck={selection.onToggle}
                        onClick={(id) => onOpenItem?.(id)}
                    />
                ))}
            </ContentGrid.Root>
        </>
    );
}

type ListProps = {
    items: Media[];
    selection: Extract<MediaBrowserSelection, { mode: 'bulk' }>;
    currentSort: { key: string; direction: SortDirection } | null;
    onSort: (key: string, direction: SortDirection) => void;
    onOpenItem?: (id: string) => void;
};

/** Sortable table. Only reachable in `bulk` mode; the picker is grid-only. */
function MediaBrowserList({
    items,
    selection,
    currentSort,
    onSort,
    onOpenItem,
}: ListProps): React.ReactElement {
    const { t } = useTranslation();

    return (
        <Table.Root>
            <Table.Head>
                <Table.Row>
                    <Table.Th className="am-table-checkbox-col">
                        <Checkbox
                            checked={selection.allChecked}
                            onChange={selection.onToggleAll}
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
                    <Table.SortTh sortKey="size" currentSort={currentSort} onSort={onSort}>
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
                        checked={selection.checkedIds.has(item.id)}
                        onToggleCheck={selection.onToggle}
                        onClick={(id) => onOpenItem?.(id)}
                    />
                ))}
            </Table.Body>
        </Table.Root>
    );
}

/** The four sortable columns in both directions, plus the unsorted default. */
function sortOptions(t: (key: string) => string): { value: string; label: string }[] {
    return [
        { value: SORT_NONE, label: t('media.sortDefault') },
        { value: 'filename:asc', label: t('media.sortFilenameAsc') },
        { value: 'filename:desc', label: t('media.sortFilenameDesc') },
        { value: 'mimeType:asc', label: t('media.sortMimeTypeAsc') },
        { value: 'mimeType:desc', label: t('media.sortMimeTypeDesc') },
        { value: 'size:asc', label: t('media.sortSizeAsc') },
        { value: 'size:desc', label: t('media.sortSizeDesc') },
        { value: 'createdAt:desc', label: t('media.sortCreatedAtDesc') },
        { value: 'createdAt:asc', label: t('media.sortCreatedAtAsc') },
    ];
}

/** Narrow an arbitrary sort key to one the media API accepts. */
function isSortKey(key: string): key is MediaSortKey {
    return (MEDIA_SORT_KEYS as readonly string[]).includes(key);
}
