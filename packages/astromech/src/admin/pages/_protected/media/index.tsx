import React, { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, LayoutList, Trash2 } from 'lucide-react';
import {
    Checkbox,
    ContentGrid,
    Dropdown,
    DropZone,
    EmptyState,
    Page,
    PageContent,
    PageHeader,
    PageLoading,
    PageTitle,
    Pagination,
    SearchInput,
    Select,
    Table,
    Toolbar,
    ToolbarStart,
    ToolbarEnd,
    ToggleGroup,
    UploadButton,
    UploadZone,
    useConfirm,
} from '@/admin/components/ui/index.js';
import type { SortDirection } from '@/admin/components/ui/table.js';
import { MediaCard } from '@/admin/components/media/MediaCard.js';
import { MediaRow } from '@/admin/components/media/MediaRow.js';
import { MediaDetailModal } from '@/admin/components/media/MediaDetailModal.js';
import { useViewMode } from '@/admin/hooks/use-view-mode.js';
import { useSelection } from '@/admin/hooks/use-selection.js';
import { useDebounce } from '@/admin/hooks/use-debounce.js';
import {
    useUploadMedia,
    usePermissions,
    useMediaQuery,
    useBulkDeleteMedia,
} from '@/admin/hooks/index.js';
import {
    MEDIA_ACCEPT,
    MEDIA_SORT_KEYS,
    TYPE_FILTER_KEYS,
    TYPE_FILTER_VALUES,
} from '@/admin/types/media.js';
import type { MediaSortKey, TypeFilter } from '@/admin/types/media.js';

const PER_PAGE = 20;
const SEARCH_DEBOUNCE_MS = 250;

type MediaSearch = {
    q?: string;
    type?: TypeFilter;
    page?: number;
    sort?: MediaSortKey;
    dir?: 'asc' | 'desc';
};

function MediaIndexPage(): React.ReactElement {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const navigate = Route.useNavigate();

    const {
        q = '',
        type: typeFilter = 'all',
        page: pageParam = 1,
        sort,
        dir,
    } = Route.useSearch();
    const [viewMode, setViewMode] = useViewMode('media');
    const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

    // The input is local so typing stays instant; only the settled value reaches
    // the URL, and it replaces rather than pushes so one search is one history entry.
    const [searchInput, setSearchInput] = useState(q);
    const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);

    useEffect(() => {
        if (debouncedSearch === q) return;
        void navigate({
            replace: true,
            search: (prev) => {
                const next: MediaSearch = { ...prev };
                if (debouncedSearch) next.q = debouncedSearch;
                else delete next.q;
                delete next.page;
                return next;
            },
        });
    }, [debouncedSearch, q, navigate]);

    function setTypeFilter(value: TypeFilter): void {
        void navigate({
            search: (prev) => {
                const next: MediaSearch = { ...prev };
                if (value === 'all') delete next.type;
                else next.type = value;
                delete next.page;
                return next;
            },
        });
    }

    function setPage(value: number): void {
        void navigate({
            search: (prev) => {
                const next: MediaSearch = { ...prev };
                if (value === 1) delete next.page;
                else next.page = value;
                return next;
            },
        });
    }

    function setSort(key: string, direction: SortDirection): void {
        void navigate({
            search: (prev) => {
                const next: MediaSearch = { ...prev };
                if (direction === null || !isSortKey(key)) {
                    delete next.sort;
                    delete next.dir;
                } else {
                    next.sort = key;
                    next.dir = direction;
                }
                delete next.page;
                return next;
            },
        });
    }

    const { canUploadMedia, canDeleteMedia } = usePermissions();
    const { upload, isUploading } = useUploadMedia();

    const currentPage = Math.max(1, pageParam);
    const queryParams = {
        ...(q ? { search: q } : {}),
        ...(typeFilter !== 'all' ? { where: { mimeType: typeFilter } } : {}),
        ...(sort ? { sort: { [sort]: dir ?? 'asc' } } : {}),
        page: currentPage,
        limit: PER_PAGE,
    };

    const { data, isLoading, isError } = useMediaQuery(queryParams);

    const items = data?.data ?? [];
    const totalItems = data?.pagination?.total;
    const totalPages = Math.max(1, data?.pagination?.pages ?? 1);

    // Selection is scoped to the active query: narrowing the list must not leave
    // a bulk action pointed at rows the user can no longer see.
    const selectionScope = `${q}|${typeFilter}|${currentPage}|${sort ?? ''}|${dir ?? ''}`;
    const { checkedIds, toggle, toggleAll, allChecked, someChecked, reset } = useSelection(
        items,
        selectionScope
    );

    const bulkDeleteMutation = useBulkDeleteMedia({
        onSuccess: () => {
            reset();
            // The last page can empty out entirely; step back rather than
            // stranding the user on a page past the end.
            if (items.length === checkedIds.size && currentPage > 1) {
                setPage(currentPage - 1);
            }
        },
    });

    const currentSort = sort ? { key: sort, direction: dir ?? 'asc' } : null;
    const isEmpty = items.length === 0;
    const isFiltered = q !== '' || typeFilter !== 'all';

    return (
        <>
            <Page>
                <PageHeader>
                    <PageTitle>{t('media.title')}</PageTitle>
                    {canUploadMedia() && (
                        <UploadButton
                            multiple
                            disabled={isUploading}
                            loading={isUploading}
                            onUpload={upload}
                        />
                    )}
                </PageHeader>

                <PageContent>
                    <Toolbar>
                        <ToolbarStart>
                            {someChecked && canDeleteMedia() && (
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
                                                        bulkDeleteMutation.mutate(ids),
                                                });
                                            },
                                        },
                                    ]}
                                />
                            )}
                            <SearchInput
                                placeholder={t('media.searchPlaceholder')}
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                            />
                            <Select
                                value={typeFilter}
                                onValueChange={(v) => {
                                    setTypeFilter((v ?? 'all') as TypeFilter);
                                }}
                                options={TYPE_FILTER_VALUES.map((value) => ({
                                    value,
                                    label: t(TYPE_FILTER_KEYS[value]),
                                }))}
                                triggerPrefix={t('media.typeFilterPrefix')}
                                className="am-select-trigger-auto"
                            />
                        </ToolbarStart>

                        <ToolbarEnd>
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
                        </ToolbarEnd>
                    </Toolbar>

                    {isError ? (
                        <EmptyState title={t('media.listFailed')} />
                    ) : isLoading ? (
                        <PageLoading />
                    ) : (
                        <DropZone
                            onUpload={upload}
                            accept={MEDIA_ACCEPT}
                            multiple
                            overlayLabel={t('media.dropOverlayLabel')}
                            disabled={isUploading || !canUploadMedia()}
                        >
                            {isEmpty ? (
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
                                ) : canUploadMedia() ? (
                                    <UploadZone
                                        className="am-media-upload-zone-wrap"
                                        onUpload={upload}
                                        disabled={isUploading}
                                        label={t('media.uploadLabel')}
                                    />
                                ) : (
                                    <EmptyState title={t('media.noResults')} />
                                )
                            ) : (
                                <div aria-busy={isUploading}>
                                    {viewMode === 'grid' && (
                                        <div className="am-media-select-bar">
                                            <Checkbox
                                                checked={allChecked}
                                                onChange={toggleAll}
                                                label={t('common.selectAll')}
                                            />
                                        </div>
                                    )}

                                    {viewMode === 'grid' ? (
                                        <ContentGrid.Root>
                                            {items.map((item) => (
                                                <MediaCard
                                                    key={item.id}
                                                    item={item}
                                                    checked={checkedIds.has(item.id)}
                                                    onToggleCheck={toggle}
                                                    onClick={setSelectedMediaId}
                                                />
                                            ))}
                                        </ContentGrid.Root>
                                    ) : (
                                        <Table.Root>
                                            <Table.Head>
                                                <Table.Row>
                                                    <Table.Th className="am-table-checkbox-col">
                                                        <Checkbox
                                                            checked={allChecked}
                                                            onChange={toggleAll}
                                                            aria-label={t(
                                                                'common.selectAll'
                                                            )}
                                                        />
                                                    </Table.Th>
                                                    <Table.SortTh
                                                        sortKey="filename"
                                                        currentSort={currentSort}
                                                        onSort={setSort}
                                                    >
                                                        {t('media.colFile')}
                                                    </Table.SortTh>
                                                    <Table.SortTh
                                                        sortKey="mimeType"
                                                        currentSort={currentSort}
                                                        onSort={setSort}
                                                    >
                                                        {t('media.metaType')}
                                                    </Table.SortTh>
                                                    <Table.SortTh
                                                        sortKey="size"
                                                        currentSort={currentSort}
                                                        onSort={setSort}
                                                    >
                                                        {t('media.metaSize')}
                                                    </Table.SortTh>
                                                    <Table.SortTh
                                                        sortKey="createdAt"
                                                        currentSort={currentSort}
                                                        onSort={setSort}
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
                                                        onToggleCheck={toggle}
                                                        onClick={setSelectedMediaId}
                                                    />
                                                ))}
                                            </Table.Body>
                                        </Table.Root>
                                    )}

                                    <Pagination
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        onPage={setPage}
                                        {...(totalItems !== undefined
                                            ? { totalItems }
                                            : {})}
                                    />
                                </div>
                            )}
                        </DropZone>
                    )}
                </PageContent>
            </Page>

            <MediaDetailModal
                mediaId={selectedMediaId}
                onClose={() => setSelectedMediaId(null)}
                onDeleted={() => {
                    setSelectedMediaId(null);
                }}
                canDelete={canDeleteMedia()}
                canUpload={canUploadMedia()}
            />
        </>
    );
}

/** Narrow an arbitrary sort key off the URL to one the API accepts. */
function isSortKey(key: string): key is MediaSortKey {
    return (MEDIA_SORT_KEYS as readonly string[]).includes(key);
}

export const Route = createFileRoute('/_protected/media/')({
    validateSearch: (search: Record<string, unknown>): MediaSearch => {
        const out: MediaSearch = {};
        if (typeof search['q'] === 'string' && search['q']) out.q = search['q'];
        if (
            typeof search['type'] === 'string' &&
            (TYPE_FILTER_VALUES as readonly string[]).includes(search['type'])
        ) {
            out.type = search['type'] as TypeFilter;
        }
        const pageRaw = search['page'];
        const pageNum =
            typeof pageRaw === 'number'
                ? pageRaw
                : typeof pageRaw === 'string'
                  ? Number(pageRaw)
                  : NaN;
        if (Number.isFinite(pageNum) && pageNum > 1) out.page = pageNum;

        const sortRaw = search['sort'];
        if (typeof sortRaw === 'string' && isSortKey(sortRaw)) {
            out.sort = sortRaw;
            out.dir = search['dir'] === 'desc' ? 'desc' : 'asc';
        }
        return out;
    },
    component: MediaIndexPage,
});
