/**
 * One locale's saved versions of a resource, newest first, each restorable.
 * Shared by media and users — the two differ only in which hooks feed the
 * props here. The full `VersionHistory` is a page with a diff pane; this is
 * a list alone, sized for a sidebar panel.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDatetime } from '@/utilities/dates';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/confirm';
import { Spinner } from '../ui/spinner';

/** The shape every resource's version list shares — enough to list and restore. */
export type VersionListItem = {
    id: string;
    version: number;
    createdAt: Date;
};

export type ContentVersionsPanelProps = {
    versions: VersionListItem[];
    isLoading: boolean;
    canUpdate: boolean;
    onRestore: (versionId: string) => void;
    isRestoring: boolean;
};

export function ContentVersionsPanel({
    versions,
    isLoading,
    canUpdate,
    onRestore,
    isRestoring,
}: ContentVersionsPanelProps): React.ReactElement {
    const { t } = useTranslation();
    const confirm = useConfirm();

    const sorted = [...versions].sort((a, b) => b.version - a.version);

    function requestRestore(versionId: string, version: number): void {
        confirm({
            title: t('versions.confirmRestoreTitle', { number: version }),
            description: t('versions.confirmRestoreMessage'),
            confirmLabel: t('versions.confirmRestoreLabel'),
            onConfirm: () => onRestore(versionId),
        });
    }

    return (
        <section className="am-content-versions" aria-busy={isLoading}>
            <h3 className="am-content-versions-heading">{t('versions.pageTitle')}</h3>
            {isLoading ? (
                <Spinner />
            ) : sorted.length === 0 ? (
                <p className="am-text-muted am-text-sm">{t('versions.noVersions')}</p>
            ) : (
                <ul className="am-content-versions-list">
                    {sorted.map((version) => (
                        <li className="am-content-versions-item" key={version.id}>
                            <span className="am-content-versions-number">
                                v{version.version}
                            </span>
                            <span className="am-content-versions-date am-text-muted am-text-sm">
                                {formatDatetime(version.createdAt)}
                            </span>
                            {canUpdate && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                        requestRestore(version.id, version.version)
                                    }
                                    disabled={isRestoring}
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
