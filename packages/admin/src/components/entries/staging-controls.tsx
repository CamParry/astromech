/**
 * The staging pieces the entry and global edit pages share: the header
 * controls that stage, open, merge or discard a staged change, the banner on
 * a staged row, the read-only banner and the link to the version history.
 */

import type { EditController } from '../../hooks/use-edit-controller';
import { ArrowLeft, GitMerge, Layers, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '../../rendering/cells/link';
import { Button } from '../ui/button';
import { Panel } from '../ui/panel';

/**
 * On the canonical row: "Stage change", or "View staged" when one exists. On
 * the staged row: Merge (needs publish) and Discard.
 */
export function StagingControls({
    controller,
}: {
    controller: EditController;
}): React.ReactElement | null {
    const { t } = useTranslation();
    const { staging, isStaged, isReadOnly, canPublish, paths } = controller;
    if (!staging.enabled) return null;

    if (!isStaged) {
        if (isReadOnly) return null;
        return staging.stagedChange !== null ? (
            <Link to={paths.staged} className="am-btn am-btn-secondary am-btn-md">
                <Layers size={16} />
                {t('staging.viewStaged')}
            </Link>
        ) : (
            <Button
                variant="secondary"
                icon={<Layers size={16} />}
                onClick={staging.create}
                loading={staging.isCreating}
            >
                {t('staging.stageChange')}
            </Button>
        );
    }

    return (
        <>
            {canPublish && (
                <Button
                    variant="primary"
                    icon={<GitMerge size={16} />}
                    onClick={staging.handleMerge}
                    loading={staging.isMerging}
                >
                    {t('staging.merge')}
                </Button>
            )}
            {!isReadOnly && (
                <Button
                    variant="danger"
                    icon={<Trash2 size={16} />}
                    onClick={staging.handleDiscard}
                    loading={staging.isDiscarding}
                >
                    {t('staging.discard')}
                </Button>
            )}
        </>
    );
}

/** The banners above the form: which row is on screen, and whether it can be edited. */
export function EditBanners({
    controller,
    title,
}: {
    controller: EditController;
    /** What the staged banner calls the canonical row. */
    title: string;
}): React.ReactElement {
    const { t } = useTranslation();
    return (
        <>
            {controller.isStaged && (
                <div className="am-banner am-banner-info">
                    <span>{t('staging.banner', { title })}</span>
                    <Link to={controller.paths.canonical} className="am-link am-text-sm">
                        <ArrowLeft size={14} />
                        {t('staging.backToCurrent')}
                    </Link>
                </div>
            )}
            {controller.isReadOnly && (
                <div className="am-banner am-banner-info">
                    {t('permissions.readOnly')}
                </div>
            )}
        </>
    );
}

/** The sidebar panel linking to this locale's version history. */
export function VersionsLink({
    controller,
}: {
    controller: EditController;
}): React.ReactElement {
    const { t } = useTranslation();
    return (
        <Panel>
            {controller.versionCount > 0 ? (
                <Link to={controller.paths.versions} className="am-link am-text-sm">
                    {t('versions.revisionsLink', { count: controller.versionCount })}
                </Link>
            ) : (
                <span className="am-text-sm am-text-muted">
                    {t('versions.noRevisionsYet')}
                </span>
            )}
        </Panel>
    );
}
