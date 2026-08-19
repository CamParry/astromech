/**
 * The no-results state: why the list is empty when filtered, an upload
 * invitation when it isn't.
 */

import type { MediaBrowserQuery } from '@/admin/types/media';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, UploadZone } from '@/admin/components/ui/index';
import { TYPE_FILTER_KEYS } from '@/admin/types/media';

export type MediaEmptyProps = {
    query: MediaBrowserQuery;
    canUpload: boolean;
    isUploading: boolean;
    onUpload: (files: File[]) => void;
    accept: string;
    multiple: boolean;
};

export function MediaEmpty({
    query,
    canUpload,
    isUploading,
    onUpload,
    accept,
    multiple,
}: MediaEmptyProps): React.ReactElement {
    const { t } = useTranslation();
    const { q, type: typeFilter } = query;

    if (q !== '' || typeFilter !== 'all') {
        return (
            <EmptyState
                title={t('media.noResults')}
                description={
                    q
                        ? t('media.noSearchResults', { query: q })
                        : t('media.noTypeResults', {
                              type: t(TYPE_FILTER_KEYS[typeFilter]).toLowerCase(),
                          })
                }
            />
        );
    }

    if (canUpload) {
        return (
            <UploadZone
                className="am-media-upload-zone-wrap"
                onUpload={onUpload}
                disabled={isUploading}
                accept={accept}
                multiple={multiple}
                label={t('media.uploadLabel')}
            />
        );
    }

    return <EmptyState title={t('media.noResults')} />;
}
