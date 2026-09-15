/**
 * Media picker for the media field's modal: filters, a grid of selectable
 * tiles, pagination. Query state is owned by the host.
 */

import type { MediaBrowserQuery } from '../../types/media';
import type { Media } from 'astromech';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaBrowser } from '../../hooks/use-media-browser';
import { usePermissions } from '../../hooks/use-permissions';
import { useUploadMedia } from '../../hooks/use-upload-media';
import { MEDIA_ACCEPT } from '../../types/media';
import { ContentGrid } from '../ui/content-grid';
import { DropZone } from '../ui/drop-zone';
import { EmptyState } from '../ui/empty-state';
import { PageLoading } from '../ui/page';
import { Pagination } from '../ui/pagination';
import { Toolbar, ToolbarEnd, ToolbarStart } from '../ui/toolbar';
import { UploadButton } from '../ui/upload-button';
import { MediaCard } from './media-card';
import { MediaEmpty } from './media-empty';
import { MediaFilters } from './media-filters';
import { MediaSortSelect } from './media-sort-select';

const DEFAULT_PER_PAGE = 24;

export type MediaPickerProps = {
    query: MediaBrowserQuery;
    onQueryChange: (next: Partial<MediaBrowserQuery>) => void;
    selectedIds: string[];
    onPick: (item: Media) => void;
    multiple: boolean;
    accept?: string;
    perPage?: number;
};

export function MediaPicker({
    query,
    onQueryChange,
    selectedIds,
    onPick,
    multiple,
    accept = MEDIA_ACCEPT,
    perPage = DEFAULT_PER_PAGE,
}: MediaPickerProps): React.ReactElement {
    const { t } = useTranslation();
    const { canUploadMedia } = usePermissions();
    const { upload, isUploading } = useUploadMedia();
    const { items, totalItems, totalPages, currentPage, isLoading, isError } =
        useMediaBrowser(query, perPage);

    const canUpload = canUploadMedia();

    return (
        <div className="am-media-browser">
            <Toolbar>
                <ToolbarStart>
                    <MediaFilters query={query} onQueryChange={onQueryChange} />
                    <MediaSortSelect query={query} onQueryChange={onQueryChange} />
                </ToolbarStart>

                {canUpload && (
                    <ToolbarEnd>
                        <UploadButton
                            onUpload={upload}
                            accept={accept}
                            multiple={multiple}
                            disabled={isUploading}
                            loading={isUploading}
                            size="sm"
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
                    multiple={multiple}
                    overlayLabel={t('media.dropOverlayLabel')}
                    disabled={isUploading || !canUpload}
                >
                    {items.length === 0 ? (
                        <MediaEmpty
                            query={query}
                            canUpload={canUpload}
                            isUploading={isUploading}
                            onUpload={upload}
                            accept={accept}
                            multiple={multiple}
                        />
                    ) : (
                        <div aria-busy={isUploading}>
                            <ContentGrid.Root>
                                {items.map((item) => (
                                    <MediaCard
                                        key={item.id}
                                        item={item}
                                        selected={selectedIds.includes(item.id)}
                                        onClick={() => onPick(item)}
                                    />
                                ))}
                            </ContentGrid.Root>

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
        </div>
    );
}
