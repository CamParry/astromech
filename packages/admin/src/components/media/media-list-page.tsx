/**
 * The media library: a `DataList` of files over `useListState`, as a table or
 * a grid, with a type filter, bulk delete, uploads by button or drop, and the
 * detail modal. The search, sort, page, type and open item live in the URL.
 */

import type { TypeFilter } from '../../types/media';
import type { DataListBulkAction, DataListColumn } from '../ui/data-list';
import type { ListSearch } from '../ui/use-list-state';
import type { SelectionResult } from '../ui/use-selection';
import type { Media } from 'astromech';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAiContext } from '../../context/ai-context';
import { useBulkDeleteMedia, useMediaQuery } from '../../hooks/media';
import { usePermissions } from '../../hooks/use-permissions';
import { useUploadMedia } from '../../hooks/use-upload-media';
import { useViewMode } from '../../hooks/use-view-mode';
import { isSortKey, MEDIA_ACCEPT, TYPE_FILTER_VALUES } from '../../types/media';
import { formatBytes } from '../../utilities/bytes';
import { formatDatetime } from '../../utilities/dates';
import { ViewModeToggle } from '../layout/view-mode-toggle';
import { DataList } from '../ui/data-list';
import { DropZone } from '../ui/drop-zone';
import { Page, PageContent, PageHeader, PageTitle } from '../ui/page';
import { UploadButton } from '../ui/upload-button';
import { parseSort, useListState, validateListSearch } from '../ui/use-list-state';
import { MediaDetailModal } from './media-detail-modal';
import { MediaEmpty } from './media-empty';
import { MediaTypeSelect } from './media-filters';
import { MediaGrid } from './media-grid';
import { MediaSortSelect } from './media-sort-select';
import { MediaThumb } from './media-thumb';
import { MediaUploadDialog } from './media-upload-dialog';

const PER_PAGE = 20;

/** The media library's URL search: the list's params, the type filter and the open item. */
export type MediaListSearch = ListSearch & {
    type?: TypeFilter;
    item?: string;
};

/** Parse raw URL search into the library's params, dropping any that do not parse. */
export function validateMediaListSearch(
    search: Record<string, unknown>
): MediaListSearch {
    const out: MediaListSearch = validateListSearch(search);
    // The API refuses a sort by any other column, which would fail the list.
    if (out.sort !== undefined && !isSortKey(parseSort(out.sort)?.key ?? '')) {
        delete out.sort;
    }
    const type = search['type'];
    if (
        typeof type === 'string' &&
        type !== 'all' &&
        (TYPE_FILTER_VALUES as readonly string[]).includes(type)
    ) {
        out.type = type as TypeFilter;
    }
    if (typeof search['item'] === 'string' && search['item']) {
        out.item = search['item'];
    }
    return out;
}

export function MediaListPage(): React.ReactElement {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const list = useListState({ pageSize: PER_PAGE });
    const raw: Record<string, unknown> = useSearch({ strict: false });
    const { type: typeFilter = 'all', item } = validateMediaListSearch(raw);
    const [viewMode, setViewMode] = useViewMode('media');

    const { canUploadMedia, canUpdateMedia, canDeleteMedia } = usePermissions();
    const { upload, isUploading, uploadDialog } = useUploadMedia();
    const canUpload = canUploadMedia();

    useAiContext({ kind: 'media', label: t('media.title') }, { depth: 0 });

    const { data, isLoading, isError } = useMediaQuery({
        ...list.queryParams,
        ...(typeFilter !== 'all' ? { where: { mimeType: typeFilter } } : {}),
    });
    const items = data?.data ?? [];

    // The open detail item lives in the URL too. Opening pushes so Back closes
    // the modal; closing replaces so there's no dead forward entry.
    function openItem(id: string): void {
        void navigate({
            to: '.',
            search: (prev: Record<string, unknown>) => ({ ...prev, item: id }),
        });
    }

    function closeItem(): void {
        void navigate({ to: '.', replace: true, search: withoutItem });
    }

    /** The item is gone, so its unsaved edits are not worth asking about. */
    function handleItemDeleted(): void {
        void navigate({
            to: '.',
            replace: true,
            search: withoutItem,
            ignoreBlocker: true,
        });
    }

    const bulkDelete = useBulkDeleteMedia({
        onSuccess: (deletedIds) => {
            // The last page can empty out entirely; step back rather than
            // stranding the user on a page past the end.
            if (deletedIds.length === items.length && list.page > 1) {
                list.setPage(list.page - 1);
            }
        },
    });

    const bulkActions: DataListBulkAction[] = canDeleteMedia()
        ? [
              {
                  label: t('common.delete'),
                  icon: <Trash2 size={14} />,
                  tone: 'danger',
                  run: (ids) => bulkDelete.mutateAsync(ids),
              },
          ]
        : [];

    const columns: DataListColumn<Media>[] = [
        {
            key: 'filename',
            label: t('media.colFile'),
            sortable: true,
            // A real button, so the row opens by keyboard.
            render: (row) => (
                <button
                    type="button"
                    className="am-media-list-row-name"
                    onClick={() => openItem(row.id)}
                >
                    <MediaThumb
                        item={row}
                        width={40}
                        className="am-media-list-row-thumb"
                        iconSize={20}
                    />
                    <span className="am-media-list-row-filename">{row.filename}</span>
                </button>
            ),
        },
        {
            key: 'mimeType',
            label: t('media.metaType'),
            sortable: true,
            render: (row) => (
                <span className="am-text-mono am-text-xs am-text-muted">
                    {row.mimeType}
                </span>
            ),
        },
        {
            key: 'size',
            label: t('media.metaSize'),
            sortable: true,
            render: (row) => formatBytes(row.size),
        },
        {
            key: 'createdAt',
            label: t('media.metaUploaded'),
            sortable: true,
            render: (row) => (
                <span className="am-text-muted am-text-sm">
                    {formatDatetime(row.createdAt)}
                </span>
            ),
        },
    ];

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
                    <DropZone
                        onUpload={upload}
                        accept={MEDIA_ACCEPT}
                        multiple
                        overlayLabel={t('media.dropOverlayLabel')}
                        disabled={isUploading || !canUpload}
                    >
                        <div className="am-media-browser" aria-busy={isUploading}>
                            <DataList
                                rows={items}
                                columns={columns}
                                isLoading={isLoading}
                                isError={isError}
                                search={list.q}
                                onSearch={list.setQuery}
                                searchPlaceholder={t('media.searchPlaceholder')}
                                sort={list.sort}
                                onSort={list.setSort}
                                page={list.page}
                                pages={Math.max(1, data?.pagination?.pages ?? 1)}
                                {...(data?.pagination != null
                                    ? { total: data.pagination.total }
                                    : {})}
                                onPage={list.setPage}
                                bulkActions={bulkActions}
                                selectionKey={typeFilter}
                                filters={
                                    <>
                                        <MediaTypeSelect
                                            value={typeFilter}
                                            onChange={(value) =>
                                                list.setFilters({
                                                    type:
                                                        value === 'all'
                                                            ? undefined
                                                            : value,
                                                })
                                            }
                                        />
                                        {/* A grid has no column headers to sort by. */}
                                        {viewMode === 'grid' && (
                                            <MediaSortSelect
                                                sort={list.sort}
                                                onSort={list.setSort}
                                            />
                                        )}
                                    </>
                                }
                                toolbarEnd={
                                    <ViewModeToggle
                                        value={viewMode}
                                        onChange={setViewMode}
                                    />
                                }
                                empty={
                                    <MediaEmpty
                                        query={{ q: list.q, type: typeFilter }}
                                        canUpload={canUpload}
                                        isUploading={isUploading}
                                        onUpload={upload}
                                        accept={MEDIA_ACCEPT}
                                        multiple
                                    />
                                }
                                {...(viewMode === 'grid'
                                    ? {
                                          renderBody: (
                                              rows: Media[],
                                              selection: SelectionResult | null
                                          ) => (
                                              <MediaGrid
                                                  items={rows}
                                                  selection={selection}
                                                  onOpenItem={openItem}
                                              />
                                          ),
                                      }
                                    : {})}
                            />
                        </div>
                    </DropZone>
                </PageContent>
            </Page>

            <MediaDetailModal
                mediaId={item ?? null}
                onClose={closeItem}
                onDeleted={handleItemDeleted}
                canDelete={canDeleteMedia()}
                canUpdate={canUpdateMedia()}
                canUpload={canUpload}
            />

            <MediaUploadDialog {...uploadDialog} />
        </>
    );
}

/** The search without the open detail item. */
function withoutItem(prev: Record<string, unknown>): Record<string, unknown> {
    const out = { ...prev };
    delete out['item'];
    return out;
}
