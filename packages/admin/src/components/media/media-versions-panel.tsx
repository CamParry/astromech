/**
 * Media's wiring for `ContentVersionsPanel`: the media hooks in, the shared
 * list out.
 */

import React from 'react';
import { mediaMutations, useMediaVersions } from '../../hooks/media';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
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
    const restoreMutation = useAdminMutation(mediaMutations().restoreVersion);

    return (
        <ContentVersionsPanel
            versions={data ?? []}
            isLoading={isLoading}
            canUpdate={canUpdate}
            onRestore={(versionId) =>
                restoreMutation.mutate({ id: mediaId, locale, versionId })
            }
            isRestoring={restoreMutation.isPending}
        />
    );
}
