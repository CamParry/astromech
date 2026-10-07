/**
 * One locale's saved versions of a resource, newest first, each restorable.
 * The media modal and the user edit page pass in the version list and the
 * restore, as the entry and global pages do for `VersionHistory`. That one is
 * a page with a diff pane; this is a list alone, sized for a sidebar panel.
 */

import type { VersionMetadata } from 'astromech';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDatetime } from '../../utilities/dates';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/confirm';
import { Spinner } from '../ui/spinner';

/** The part of a version list item this panel reads: enough to list and restore. */
export type VersionListItem = Pick<VersionMetadata, 'version' | 'createdAt'>;

export type ContentVersionsPanelProps = {
    versions: VersionListItem[];
    isLoading: boolean;
    canUpdate: boolean;
    /** Restore the version with this number. */
    onRestore: (version: number) => void;
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

    function requestRestore(version: number): void {
        confirm({
            title: t('versions.confirmRestoreTitle', { number: version }),
            description: t('versions.confirmRestoreMessage'),
            confirmLabel: t('versions.confirmRestoreLabel'),
            onConfirm: () => onRestore(version),
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
                        <li className="am-content-versions-item" key={version.version}>
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
                                    onClick={() => requestRestore(version.version)}
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
