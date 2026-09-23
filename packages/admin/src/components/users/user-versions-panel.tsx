/**
 * Users' wiring for `ContentVersionsPanel`: the users hooks in, the shared
 * list out.
 */

import React from 'react';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { userMutations, useUserVersions } from '../../hooks/users';
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
    const restoreMutation = useAdminMutation(userMutations().restoreVersion);

    return (
        <ContentVersionsPanel
            versions={data ?? []}
            isLoading={isLoading}
            canUpdate={canUpdate}
            onRestore={(versionId) =>
                restoreMutation.mutate({ id: userId, locale, versionId })
            }
            isRestoring={restoreMutation.isPending}
        />
    );
}
