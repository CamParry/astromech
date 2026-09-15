/**
 * Media's wiring for `ContentVersionsPanel`: the media hooks in, the shared
 * list out.
 */

import React from 'react';
import { useMediaVersions, useRestoreMediaVersion } from '../../hooks/media';
import { ContentVersionsPanel } from '../versions/content-versions-panel';

export type MediaVersionsPanelProps = {
    mediaId: string;
    /** The locale whose versions are listed. */
    locale: string;
    canUpdate: boolean;
};

export function MediaVersionsPanel({
    mediaId,
    locale,
    canUpdate,
}: MediaVersionsPanelProps): React.ReactElement {
    const { data, isLoading } = useMediaVersions(mediaId, locale);
    const restoreMutation = useRestoreMediaVersion(mediaId, locale);

    return (
        <ContentVersionsPanel
            versions={data ?? []}
            isLoading={isLoading}
            canUpdate={canUpdate}
            onRestore={(versionId) => restoreMutation.mutate(versionId)}
            isRestoring={restoreMutation.isPending}
        />
    );
}
