import type { SortDirection } from '@/admin/components/ui/table';
import type { MediaBrowserQuery, MediaSortKey, TypeFilter } from '@/admin/types/media';
import { createFileRoute } from '@tanstack/react-router';
import { LayoutGrid, LayoutList, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { MediaDetailModal } from '@/admin/components/media/media-detail-modal';
import { MediaEmpty } from '@/admin/components/media/media-empty';
import { MediaFilters } from '@/admin/components/media/media-filters';
import { MediaGrid } from '@/admin/components/media/media-grid';
import { MediaSortSelect, sortPatch } from '@/admin/components/media/media-sort-select';
import { MediaTable } from '@/admin/components/media/media-table';
import {
    Dropdown,
    DropZone,
    EmptyState,
    Page,
    PageContent,
    PageHeader,
    PageLoading,
    PageTitle,
    Pagination,
    ToggleGroup,
    Toolbar,
    ToolbarEnd,
    ToolbarStart,
    UploadButton,
    useConfirm,
} from '@/admin/components/ui/index';
import { useAiContext } from '@/admin/context/ai-context';
import {
    useBulkDeleteMedia,
    useMediaBrowser,
    usePermissions,
    useUploadMedia,
} from '@/admin/hooks/index';
import { useSelection } from '@/admin/hooks/use-selection';
import { useViewMode } from '@/admin/hooks/use-view-mode';
import { isSortKey, MEDIA_ACCEPT, TYPE_FILTER_VALUES } from '@/admin/types/media';

const PER_PAGE = 20;

type MediaSearch = {
    q?: string;
    type?: TypeFilter;
    page?: number;
    sort?: MediaSortKey;
    dir?: 'asc' | 'desc';
    item?: string;
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
        item,
    } = Route.useSearch();
    const [viewMode, setViewMode] = useViewMode('media');

    const { canUploadMedia, canUpdateMedia, canDeleteMedia } = usePermissions();
    const { upload, isUploading } = useUploadMedia();

    useAiContext({ kind: 'media', label: t('media.title') }, { depth: 0 });

    const query: MediaBrowserQuery = {
        q,
        type: typeFilter,
        sort,
        dir,
        page: Math.max(1, pageParam),
    };
    const { items, totalItems, totalPages, currentPage, isLoading, isError } =
        useMediaBrowser(query, PER_PAGE);

    const canUpload = canUploadMedia();
    const currentSort = sort ? { key: sort, direction: dir ?? 'asc' } : null;

    // The URL is the query owner here, so the library stays deep-linkable. A
    // search change replaces rather than pushes: one search, one history entry.
    function handleQueryChange(next: Partial<MediaBrowserQuery>): void {
        void navigate({
            replace: next.q !== undefined,
            search: (prev) => {
                const out: MediaSearch = { ...prev };
                if (next.q !== undefined) {
                    if (next.q) out.q = next.q;
                    else delete out.q;
                }
                if (next.type !== undefined) {
                    if (next.type === 'all') delete out.type;
                    else out.type = next.type;
                }
                if ('sort' in next) {
                    if (next.sort) {
                        out.sort = next.sort;
                        out.dir = next.dir ?? 'asc';
                    } else {
                        delete out.sort;
                        delete out.dir;
                    }
                }
                if (next.page !== undefined) {
                    if (next.page <= 1) delete out.page;
                    else out.page = next.page;
                }
                return out;
            },
        });
    }

    function handleSort(key: string, direction: SortDirection): void {
        handleQueryChange(sortPatch(key, direction));
    }

    // The open detail item lives in the URL too. Opening pushes so Back closes
    // the modal; closing replaces so there's no dead forward entry.
    function openItem(id: string): void {
        void navigate({ search: (prev) => ({ ...prev, item: id }) });
    }

    function closeItem(): void {
        void navigate({
            replace: true,
            search: (prev) => {
                const out: MediaSearch = { ...prev };
                delete out.item;
                return out;
            },
        });
    }

    // Selection is scoped to the active query: narrowing the list must not leave
    // a bulk action pointed at rows the user can no longer see.
    const selectionScope = `${q}|${typeFilter}|${currentPage}|${sort ?? ''}|${dir ?? ''}`;
    const { checkedIds, toggle, toggleAll, allChecked, someChecked, reset } =
        useSelection(items, selectionScope);

    const bulkDeleteMutation = useBulkDeleteMedia({
        onSuccess: (deletedIds) => {
            reset();
            // The last page can empty out entirely; step back rather than
            // stranding the user on a page past the end.
            if (deletedIds.length === items.length && currentPage > 1) {
                handleQueryChange({ page: currentPage - 1 });
            }
        },
    });

    const bulkActions = someChecked && canDeleteMedia() && (
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
                            title: t('media.bulkDeleteTitle', { count: ids.length }),
                            description: t('media.bulkDeleteDescription'),
                            confirmLabel: t('common.delete'),
                            onConfirm: () => bulkDeleteMutation.mutate(ids),
                        });
                    },
                },
            ]}
        />
    );

    return (
        <>
            <Page>
                <PageHeader>
                    <PageTitle>{t('media.title')}</PageTitle>
                    {canUpload && (
                        <UploadButton
                            multiple
                            disabled={isUploading}
                            loading={isUploading}
                            onUpload={upload}
                        />
                    )}
                </PageHeader>

                <PageContent>
                    <div className="am-media-browser">
                        <Toolbar>
                            <ToolbarStart>
                                {bulkActions}
                                <MediaFilters
                                    query={query}
                                    onQueryChange={handleQueryChange}
                                />
                                {viewMode === 'grid' && (
                                    <MediaSortSelect
                                        query={query}
                                        onQueryChange={handleQueryChange}
                                    />
                                )}
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
                                disabled={isUploading || !canUpload}
                            >
                                {items.length === 0 ? (
                                    <MediaEmpty
                                        query={query}
                                        canUpload={canUpload}
                                        isUploading={isUploading}
                                        onUpload={upload}
                                        accept={MEDIA_ACCEPT}
                                        multiple
                                    />
                                ) : (
                                    <div aria-busy={isUploading}>
                                        {viewMode === 'list' ? (
                                            <MediaTable
                                                items={items}
                                                checkedIds={checkedIds}
                                                onToggle={toggle}
                                                onToggleAll={toggleAll}
                                                allChecked={allChecked}
                                                currentSort={currentSort}
                                                onSort={handleSort}
                                                onOpenItem={openItem}
                                            />
                                        ) : (
                                            <MediaGrid
                                                items={items}
                                                checkedIds={checkedIds}
                                                onToggle={toggle}
                                                onToggleAll={toggleAll}
                                                allChecked={allChecked}
                                                onOpenItem={openItem}
                                            />
                                        )}

                                        <Pagination
                                            currentPage={currentPage}
                                            totalPages={totalPages}
                                            onPage={(page) => handleQueryChange({ page })}
                                            {...(totalItems !== undefined
                                                ? { totalItems }
                                                : {})}
                                        />
                                    </div>
                                )}
                            </DropZone>
                        )}
                    </div>
                </PageContent>
            </Page>

            <MediaDetailModal
                mediaId={item ?? null}
                onClose={closeItem}
                onDeleted={closeItem}
                canDelete={canDeleteMedia()}
                canUpdate={canUpdateMedia()}
                canUpload={canUpload}
            />
        </>
    );
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
        if (typeof search['item'] === 'string' && search['item']) {
            out.item = search['item'];
        }
        return out;
    },
    component: MediaIndexPage,
});
