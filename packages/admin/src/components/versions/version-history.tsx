/**
 * Version history UI: the list of a locale's saved versions, the diff of the
 * selected one against its predecessor, and the restore action. Shared by
 * `EntryVersionsPage` and `GlobalVersionsPage`, which pass in the version list
 * and the query that reads one version. The list carries metadata only, so the
 * page reads the selected version and the one before it for the diff.
 */

import type { QueryKey, UseQueryOptions } from '@tanstack/react-query';
import type { JsonObject, VersionMetadata } from 'astromech';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authorName, useAuthorNames } from '../../hooks/author-names';
import { Link } from '../../rendering/cells/link';
import { formatDatetime } from '../../utilities/dates';
import { Breadcrumb } from '../ui/breadcrumb';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/confirm';
import { Page, PageContent, PageHeader, PageLoading, PageTitle } from '../ui/page';
import { Panel } from '../ui/panel';
import { Spinner } from '../ui/spinner';

/**
 * The part of a version's snapshot this UI diffs: the structural subset both
 * `EntryVersion` and `GlobalVersion` satisfy. `title` and `slug` belong to an
 * entry alone and are diffed only when they are there.
 */
export type VersionSnapshot = {
    fields: JsonObject;
    title?: string;
    slug?: string | null;
};

/** One version as `getVersion` answers it, read for the diff. */
export type VersionWithSnapshot = { version: number; snapshot: VersionSnapshot };

/** A version list item as this UI reads it. */
type VersionListItem = Pick<VersionMetadata, 'version' | 'createdAt' | 'createdBy'>;

type DiffEntry = {
    field: string;
    oldValue: unknown;
    newValue: unknown;
};

function computeDiff(
    older: VersionSnapshot | null,
    newer: VersionSnapshot,
    hasTitle: boolean
): DiffEntry[] {
    // A resource with no slug column (a global) contributes no slug row; an
    // entry's is compared even when null, as it always has been.
    const hasSlug = 'slug' in newer;
    const olderFields: Record<string, unknown> = {
        ...(hasTitle ? { title: older?.title ?? '' } : {}),
        ...(hasSlug ? { slug: older?.slug ?? '' } : {}),
        ...(older?.fields ?? {}),
    };
    const newerFields: Record<string, unknown> = {
        ...(hasTitle ? { title: newer.title } : {}),
        ...(hasSlug ? { slug: newer.slug ?? '' } : {}),
        ...newer.fields,
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
    version: VersionListItem;
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
    /** The selected version's list item, for its number, date and author. */
    selected: VersionListItem;
    /** What the selected version holds. */
    snapshot: VersionSnapshot;
    /** What the version before it holds; null for the first version. */
    previous: VersionSnapshot | null;
    authorNames: Map<string, string>;
    onRestore: () => void;
    isRestoring: boolean;
    hasTitle: boolean;
};

function DiffView({
    selected,
    snapshot,
    previous,
    authorNames,
    onRestore,
    isRestoring,
    hasTitle,
}: DiffViewProps): React.ReactElement {
    const { t } = useTranslation();
    const diff = computeDiff(previous, snapshot, hasTitle);
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

export type VersionHistoryProps<V extends VersionWithSnapshot, K extends QueryKey> = {
    /** The locale's versions, in any order; the list sorts newest first. */
    versions: VersionListItem[] | undefined;
    isLoading: boolean;
    /** The query that reads one version of this locale, with its snapshot. */
    versionQuery: (version: number) => UseQueryOptions<V, Error, V, K>;
    /** Restore the version with this number. */
    onRestore: (version: number) => void;
    isRestoring: boolean;
    /** Trail above the page title, ending at the version-history crumb. */
    breadcrumb: { label: string; to?: string }[];
    /** Where "back to edit" goes. */
    editPath: string;
    /** Whether the resource carries a title to diff. */
    hasTitle: boolean;
};

export function VersionHistory<V extends VersionWithSnapshot, K extends QueryKey>({
    versions: rawVersions,
    isLoading,
    versionQuery,
    onRestore,
    isRestoring,
    breadcrumb,
    editPath,
    hasTitle,
}: VersionHistoryProps<V, K>): React.ReactElement {
    const confirm = useConfirm();
    const { t } = useTranslation();

    const [selectedNumber, setSelectedNumber] = useState<number | null>(null);

    const authorNames = useAuthorNames();

    const versions =
        rawVersions !== undefined
            ? [...rawVersions].sort((a, b) => b.version - a.version)
            : undefined;

    // Auto-select the first (latest) version on load
    const resolvedNumber =
        selectedNumber ?? (versions != null ? (versions[0]?.version ?? null) : null);

    const selectedVersion = versions?.find((v) => v.version === resolvedNumber) ?? null;
    const selectedIndex = versions?.findIndex((v) => v.version === resolvedNumber) ?? -1;
    // Previous version in sorted array = the one after selected (older)
    const previousVersion =
        selectedIndex >= 0 && versions != null
            ? (versions[selectedIndex + 1] ?? null)
            : null;

    // The list carries no content, so the diff reads both sides it compares.
    const selectedRead = useQuery({
        ...versionQuery(selectedVersion?.version ?? 0),
        enabled: selectedVersion !== null,
    });
    const previousRead = useQuery({
        ...versionQuery(previousVersion?.version ?? 0),
        enabled: previousVersion !== null,
    });
    const snapshots =
        selectedRead.data !== undefined &&
        (previousVersion === null || previousRead.data !== undefined)
            ? {
                  selected: selectedRead.data.snapshot,
                  previous: previousRead.data?.snapshot ?? null,
              }
            : null;

    function handleRestore(): void {
        if (selectedVersion == null) return;
        const { version } = selectedVersion;
        confirm({
            title: t('versions.confirmRestoreTitle', { number: version }),
            description: t('versions.confirmRestoreMessage'),
            confirmLabel: t('versions.confirmRestoreLabel'),
            onConfirm: () => onRestore(version),
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
                                        key={version.version}
                                        version={version}
                                        isSelected={version.version === resolvedNumber}
                                        authorNames={authorNames}
                                        onClick={() => setSelectedNumber(version.version)}
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
                        ) : snapshots === null ? (
                            <Panel>
                                <Spinner />
                            </Panel>
                        ) : (
                            <DiffView
                                selected={selectedVersion}
                                snapshot={snapshots.selected}
                                previous={snapshots.previous}
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
