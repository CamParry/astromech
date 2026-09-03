/**
 * One locale's saved versions of a media item, newest first, each restorable.
 * The full `VersionHistory` is a page with a diff pane; the modal has room for
 * a list alone.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaVersions, useRestoreMediaVersion } from '@/admin/hooks/media';
import { formatDatetime } from '@/utilities/dates';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/confirm';
import { Spinner } from '../ui/spinner';

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
    const { t } = useTranslation();
    const confirm = useConfirm();
    const { data, isLoading } = useMediaVersions(mediaId, locale);
    const restoreMutation = useRestoreMediaVersion(mediaId, locale);

    const versions = [...(data ?? [])].sort((a, b) => b.version - a.version);

    function requestRestore(versionId: string, version: number): void {
        confirm({
            title: t('versions.confirmRestoreTitle', { number: version }),
            description: t('versions.confirmRestoreMessage'),
            confirmLabel: t('versions.confirmRestoreLabel'),
            onConfirm: () => restoreMutation.mutate(versionId),
        });
    }

    return (
        <section className="am-media-versions" aria-busy={isLoading}>
            <h3 className="am-media-versions-heading">{t('versions.pageTitle')}</h3>
            {isLoading ? (
                <Spinner />
            ) : versions.length === 0 ? (
                <p className="am-text-muted am-text-sm">{t('versions.noVersions')}</p>
            ) : (
                <ul className="am-media-versions-list">
                    {versions.map((version) => (
                        <li className="am-media-versions-item" key={version.id}>
                            <span className="am-media-versions-number">
                                v{version.version}
                            </span>
                            <span className="am-media-versions-date am-text-muted am-text-sm">
                                {formatDatetime(version.createdAt)}
                            </span>
                            {canUpdate && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                        requestRestore(version.id, version.version)
                                    }
                                    disabled={restoreMutation.isPending}
                                >
                                    {t('versions.restoreButton')}
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
