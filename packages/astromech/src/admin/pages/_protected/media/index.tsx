import React, { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import {
    Dropdown,
    Page,
    PageContent,
    PageHeader,
    PageTitle,
    UploadButton,
    useConfirm,
} from '@/admin/components/ui/index.js';
import { MediaBrowser } from '@/admin/components/media/media-browser.js';
import type { MediaBrowserQuery } from '@/admin/components/media/media-browser.js';
import { MediaDetailModal } from '@/admin/components/media/MediaDetailModal.js';
import { useViewMode } from '@/admin/hooks/use-view-mode.js';
import { useSelection } from '@/admin/hooks/use-selection.js';
import {
    useUploadMedia,
    usePermissions,
    useMediaQuery,
    useBulkDeleteMedia,
} from '@/admin/hooks/index.js';
import { useAIContext } from '@/admin/context/ai-context.js';
import { MEDIA_SORT_KEYS, TYPE_FILTER_VALUES } from '@/admin/types/media.js';
import type { MediaSortKey, TypeFilter } from '@/admin/types/media.js';

const PER_PAGE = 20;

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

    const { canUploadMedia, canDeleteMedia } = usePermissions();
    const { upload, isUploading } = useUploadMedia();

    useAIContext({ kind: 'media', label: t('media.title') }, { depth: 0 });

    const currentPage = Math.max(1, pageParam);

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

    // Mirrors the browser's own request so selection and bulk delete operate on
    // the rows actually on screen.
    const { data } = useMediaQuery({
        ...(q ? { search: q } : {}),
        ...(typeFilter !== 'all' ? { where: { mimeType: typeFilter } } : {}),
        ...(sort ? { sort: { [sort]: dir ?? 'asc' } } : {}),
        page: currentPage,
        limit: PER_PAGE,
    });
    const items = data?.data ?? [];

    // Selection is scoped to the active query: narrowing the list must not leave
    // a bulk action pointed at rows the user can no longer see.
    const selectionScope = `${q}|${typeFilter}|${currentPage}|${sort ?? ''}|${dir ?? ''}`;
    const { checkedIds, toggle, toggleAll, allChecked, someChecked, reset } =
        useSelection(items, selectionScope);

    const bulkDeleteMutation = useBulkDeleteMedia({
        onSuccess: () => {
            reset();
            // The last page can empty out entirely; step back rather than
            // stranding the user on a page past the end.
            if (items.length === checkedIds.size && currentPage > 1) {
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
                    <MediaBrowser
                        query={{ q, type: typeFilter, sort, dir, page: currentPage }}
                        onQueryChange={handleQueryChange}
                        selection={{
                            mode: 'bulk',
                            checkedIds,
                            onToggle: toggle,
                            onToggleAll: toggleAll,
                            allChecked,
                        }}
                        onOpenItem={setSelectedMediaId}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        canUpload={canUploadMedia()}
                        perPage={PER_PAGE}
                        toolbarExtra={bulkActions}
                    />
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
