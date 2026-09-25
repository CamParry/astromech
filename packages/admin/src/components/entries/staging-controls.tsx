/**
 * The pieces the entry and global edit pages share around the form: the
 * header's update and staging controls, the staged and read-only banners, and
 * the link to the version history.
 */

import type { EditController } from '../../hooks/use-edit-controller';
import { ArrowLeft, GitMerge, Layers, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '../../rendering/cells/link';
import { Button } from '../ui/button';
import { Panel } from '../ui/panel';

/**
 * The header's write controls. On the canonical row: "Stage change" (or "View
 * staged" when one exists), then Update. On the staged row: Update, then Merge
 * (needs publish) and Discard.
 */
export function EditActions({
    controller,
}: {
    controller: EditController;
}): React.ReactElement {
    const { t } = useTranslation();
    const { staging, isStaged, isReadOnly, canPublish, paths } = controller;
    const update = !isReadOnly && (
        <Button
            variant={isStaged ? 'secondary' : 'primary'}
            onClick={controller.handleSave}
            loading={controller.mutation.isPending}
        >
            {t('common.update')}
        </Button>
    );
    if (!staging.enabled) return <>{update}</>;

    if (!isStaged) {
        return (
            <>
                {!isReadOnly &&
                    (staging.stagedChange !== null ? (
                        <Link
                            to={paths.staged}
                            className="am-btn am-btn-secondary am-btn-md"
                        >
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
                    ))}
                {update}
            </>
        );
    }

    return (
        <>
            {update}
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
