/**
 * Version history UI: the list of a locale's saved versions, the diff of the
 * selected one against its predecessor, and the restore action. Shared by
 * `EntryVersionsPage` and `GlobalVersionsPage`, which fetch through their own
 * hooks and pass the results in.
 */

import type { EntryStatus, JsonObject } from '@/types/index';
import { Link as RouterLink } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Breadcrumb } from '@/admin/components/ui/breadcrumb';
import { Button } from '@/admin/components/ui/button';
import { useConfirm } from '@/admin/components/ui/confirm';
import {
    Page,
    PageContent,
    PageHeader,
    PageLoading,
    PageTitle,
} from '@/admin/components/ui/page';
import { Panel } from '@/admin/components/ui/panel';
import { authorName, useAuthorNames } from '@/admin/hooks/author-names';
import { formatDatetime } from '@/utilities/dates';

// Mount link bases are runtime strings; address `Link` by string `to`.
type LinkProps = Omit<React.ComponentProps<typeof RouterLink>, 'to'> & { to: string };
const Link = RouterLink as unknown as (props: LinkProps) => React.ReactElement;

/**
 * The part of a saved version this UI reads — the structural subset both
 * `EntryVersion` and `GlobalVersion` satisfy. `title` and `slug` belong to an
 * entry alone and are diffed only when they are there.
 */
export type Version = {
    id: string;
    version: number;
    fields: JsonObject | null;
    status: EntryStatus | null;
    createdAt: Date | string;
    createdBy: string | null;
    title?: string;
    slug?: string | null;
};

type DiffEntry = {
    field: string;
    oldValue: unknown;
    newValue: unknown;
};

function computeDiff(
    older: Version | null,
    newer: Version,
    hasTitle: boolean
): DiffEntry[] {
    // A resource with no slug column (a global) contributes no slug row; an
    // entry's is compared even when null, as it always has been.
    const hasSlug = 'slug' in newer;
    const olderFields: Record<string, unknown> = {
        ...(hasTitle ? { title: older?.title ?? '' } : {}),
        ...(hasSlug ? { slug: older?.slug ?? '' } : {}),
        status: older?.status ?? '',
        ...(older?.fields ?? {}),
    };
    const newerFields: Record<string, unknown> = {
        ...(hasTitle ? { title: newer.title } : {}),
        ...(hasSlug ? { slug: newer.slug ?? '' } : {}),
        status: newer.status ?? '',
        ...(newer.fields ?? {}),
    };

    const allKeys = new Set([...Object.keys(olderFields), ...Object.keys(newerFields)]);

    const entries: DiffEntry[] = [];
    for (const key of allKeys) {
        const oldVal = olderFields[key];
        const newVal = newerFields[key];
        const oldStr = JSON.stringify(oldVal);
        const newStr = JSON.stringify(newVal);
        if (oldStr !== newStr) {
            entries.push({ field: key, oldValue: oldVal, newValue: newVal });
        }
    }
    return entries;
}

function renderFieldValue(value: unknown): React.ReactElement {
    if (value === null || value === undefined) {
        return <em className="am-text-muted">empty</em>;
    }
    if (typeof value === 'object') {
        return (
            <pre className="am-versions-diff-pre">{JSON.stringify(value, null, 2)}</pre>
        );
    }
    if (Array.isArray(value)) {
        return <span>{(value as unknown[]).join(', ')}</span>;
    }
    return <span>{String(value)}</span>;
}

type VersionItemProps = {
    version: Version;
    isSelected: boolean;
    authorNames: Map<string, string>;
    onClick: () => void;
};

function VersionItem({
    version,
    isSelected,
    authorNames,
    onClick,
}: VersionItemProps): React.ReactElement {
    const author = authorName(version.createdBy, authorNames);

    return (
        <button
            type="button"
            className={['am-versions-item', isSelected ? 'am-versions-item-selected' : '']
                .filter(Boolean)
                .join(' ')}
            onClick={onClick}
        >
            <div className="am-versions-item-header">
                <span className="am-versions-item-number">#{version.version}</span>
            </div>
            <div className="am-versions-item-date">
                {formatDatetime(version.createdAt)}
            </div>
            {author !== undefined && (
                <div className="am-versions-item-author">{author}</div>
            )}
        </button>
    );
}

type DiffViewProps = {
    selected: Version;
    previous: Version | null;
    authorNames: Map<string, string>;
    onRestore: () => void;
    isRestoring: boolean;
    hasTitle: boolean;
};

function DiffView({
    selected,
    previous,
    authorNames,
    onRestore,
    isRestoring,
    hasTitle,
}: DiffViewProps): React.ReactElement {
    const { t } = useTranslation();
    const diff = computeDiff(previous, selected, hasTitle);
    const author = authorName(selected.createdBy, authorNames);

    return (
        <div className="am-versions-diff">
            <div className="am-versions-diff-toolbar">
                <div>
                    <span className="am-versions-diff-title">
                        {t('versions.version', { number: selected.version })}
                    </span>
                    <span className="am-versions-diff-subtitle">
                        {formatDatetime(selected.createdAt)}
                        {author !== undefined && ` · ${author}`}
                    </span>
                </div>
                <Button
                    variant="secondary"
                    onClick={onRestore}
                    disabled={isRestoring}
                    loading={isRestoring}
                >
                    {t('versions.restoreButton')}
                </Button>
            </div>

            {diff.length === 0 ? (
                <p className="am-text-muted" style={{ padding: '1rem' }}>
                    {previous == null
                        ? t('versions.firstVersion')
                        : t('versions.noChanges')}
                </p>
            ) : (
                <div className="am-versions-diff-fields">
                    {diff.map((entry) => (
                        <div key={entry.field} className="am-versions-diff-field">
                            <div className="am-versions-diff-field-name">
                                {entry.field}
                            </div>
                            <div className="am-versions-diff-columns">
                                {previous != null && (
                                    <>
                                        <div className="am-versions-diff-old">
                                            {renderFieldValue(entry.oldValue)}
                                        </div>
                                        <ArrowRight
                                            size={14}
                                            className="am-versions-diff-arrow"
                                        />
                                    </>
                                )}
                                <div className="am-versions-diff-new">
                                    {renderFieldValue(entry.newValue)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export type VersionHistoryProps = {
    /** The locale's versions, in any order; the list sorts newest first. */
    versions: Version[] | undefined;
    isLoading: boolean;
    onRestore: (versionId: string) => void;
    isRestoring: boolean;
    /** Trail above the page title, ending at the version-history crumb. */
    breadcrumb: { label: string; to?: string }[];
    /** Where "back to edit" goes. */
    editPath: string;
    /** Whether the resource carries a title to diff. */
    hasTitle: boolean;
};

export function VersionHistory({
    versions: rawVersions,
    isLoading,
    onRestore,
    isRestoring,
    breadcrumb,
    editPath,
    hasTitle,
}: VersionHistoryProps): React.ReactElement {
    const confirm = useConfirm();
    const { t } = useTranslation();

    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

    const authorNames = useAuthorNames();

    const versions =
        rawVersions !== undefined
            ? [...rawVersions].sort((a, b) => b.version - a.version)
            : undefined;

    // Auto-select the first (latest) version on load
    const resolvedSelectedId =
        selectedVersionId ?? (versions != null ? (versions[0]?.id ?? null) : null);

    const selectedVersion = versions?.find((v) => v.id === resolvedSelectedId) ?? null;
    const selectedIndex = versions?.findIndex((v) => v.id === resolvedSelectedId) ?? -1;
    // Previous version in sorted array = the one after selected (older)
    const previousVersion =
        selectedIndex >= 0 && versions != null
            ? (versions[selectedIndex + 1] ?? null)
            : null;

    function handleRestore(): void {
        if (selectedVersion == null) return;
        confirm({
            title: t('versions.confirmRestoreTitle', {
                number: selectedVersion.version,
            }),
            description: t('versions.confirmRestoreMessage'),
            confirmLabel: t('versions.confirmRestoreLabel'),
            onConfirm: () => onRestore(selectedVersion.id),
        });
    }

    if (isLoading) {
        return <PageLoading />;
    }

    return (
        <Page>
            <PageHeader>
                <PageTitle>{t('versions.pageTitle')}</PageTitle>
                <Breadcrumb items={breadcrumb} />
            </PageHeader>

            <PageContent>
                <div className="am-versions">
                    {/* Sidebar */}
                    <div className="am-versions-sidebar">
                        <div className="am-versions-sidebar-header">
                            <h2 className="am-versions-sidebar-title">
                                {t('versions.pageTitle')}
                            </h2>
                            <Link to={editPath} className="am-link am-text-sm">
                                <ArrowLeft
                                    size={12}
                                    style={{ marginRight: '0.25rem', display: 'inline' }}
                                />
                                {t('versions.backToEdit')}
                            </Link>
                        </div>

                        {versions == null || versions.length === 0 ? (
                            <p
                                className="am-text-muted am-text-sm"
                                style={{ padding: '1rem' }}
                            >
                                {t('versions.noVersions')}
                            </p>
                        ) : (
                            <div className="am-versions-list">
                                {versions.map((version) => (
                                    <VersionItem
                                        key={version.id}
                                        version={version}
                                        isSelected={version.id === resolvedSelectedId}
                                        authorNames={authorNames}
                                        onClick={() => setSelectedVersionId(version.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Main diff area */}
                    <div className="am-versions-main">
                        {selectedVersion == null ? (
                            <Panel>
                                <p className="am-text-muted">
                                    {t('versions.selectVersion')}
                                </p>
                            </Panel>
                        ) : (
                            <DiffView
                                selected={selectedVersion}
                                previous={previousVersion}
                                authorNames={authorNames}
                                onRestore={handleRestore}
                                isRestoring={isRestoring}
                                hasTitle={hasTitle}
                            />
                        )}
                    </div>
                </div>
            </PageContent>
        </Page>
    );
}
