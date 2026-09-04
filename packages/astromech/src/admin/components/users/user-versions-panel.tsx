/**
 * Users' wiring for `ContentVersionsPanel`: the users hooks in, the shared
 * list out.
 */

import React from 'react';
import { useRestoreUserVersion, useUserVersions } from '@/admin/hooks/users';
import { ContentVersionsPanel } from '../versions/content-versions-panel';

export type UserVersionsPanelProps = {
    userId: string;
    /** The locale whose versions are listed. */
    locale: string;
    canUpdate: boolean;
};

export function UserVersionsPanel({
    userId,
    locale,
    canUpdate,
}: UserVersionsPanelProps): React.ReactElement {
    const { data, isLoading } = useUserVersions(userId, locale);
    const restoreMutation = useRestoreUserVersion(userId, locale);

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
