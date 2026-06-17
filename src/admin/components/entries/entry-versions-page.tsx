/**
 * Shared entry version history page body.
 *
 * Extracted (Phase 3 Slice 6) verbatim from
 * `pages/_protected/entries/$type/$id/versions.tsx`, parameterized by an
 * `EntriesMount`. Behaviour and markup are unchanged from the original page;
 * the differences are the mount-bound api/cacheScope and the `basePath`-built
 * links.
 *
 * Two-column layout: version list sidebar left, diff view right.
 */

import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { formatDatetime } from '@/utilities/dates.js';
import {
    Button,
    Panel,
    Breadcrumb,
    PageLoading,
    useConfirm,
    Page,
    PageHeader,
    PageTitle,
    PageContent,
} from '@/admin/components/ui/index.js';
import {
    useEntry,
    useEntryVersions,
    useRestoreEntryVersion,
} from '@/admin/hooks/index.js';
import type { EntryVersion } from '@/types/index.js';
import type { EntriesMount } from './mount.js';

// Mount link bases are runtime strings; address `Link` by string `to`.
type LinkProps = Omit<React.ComponentProps<typeof RouterLink>, 'to'> & { to: string };
const Link = RouterLink as unknown as (props: LinkProps) => React.ReactElement;

// ============================================================================
// Helpers
// ============================================================================

type DiffEntry = {
    field: string;
    oldValue: unknown;
    newValue: unknown;
};

function computeDiff(
    older: EntryVersion | null,
    newer: EntryVersion,
    hasTitle: boolean
): DiffEntry[] {
    const olderFields: Record<string, unknown> = {
        ...(hasTitle ? { title: older?.title ?? '' } : {}),
        slug: older?.slug ?? '',
        status: older?.status ?? '',
        ...(older?.fields ?? {}),
    };
    const newerFields: Record<string, unknown> = {
        ...(hasTitle ? { title: newer.title } : {}),
        slug: newer.slug ?? '',
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

// ============================================================================
// Sub-components
// ============================================================================

type VersionItemProps = {
    version: EntryVersion;
    isSelected: boolean;
    onClick: () => void;
};

function VersionItem({
    version,
    isSelected,
    onClick,
}: VersionItemProps): React.ReactElement {
    return (
        <button
            type="button"
            className={['am-versions-item', isSelected ? 'am-versions-item-selected' : '']
                .filter(Boolean)
                .join(' ')}
            onClick={onClick}
        >
            <div className="am-versions-item-header">
                <span className="am-versions-item-number">#{version.versionNumber}</span>
            </div>
            <div className="am-versions-item-date">
                {formatDatetime(version.createdAt)}
            </div>
            {version.createdBy != null && (
                <div className="am-versions-item-author">{version.createdBy}</div>
            )}
        </button>
    );
}

type DiffViewProps = {
    selected: EntryVersion;
    previous: EntryVersion | null;
    onRestore: () => void;
    isRestoring: boolean;
    hasTitle: boolean;
};

function DiffView({
    selected,
    previous,
    onRestore,
    isRestoring,
    hasTitle,
}: DiffViewProps): React.ReactElement {
    const { t } = useTranslation();
    const diff = computeDiff(previous, selected, hasTitle);

    return (
        <div className="am-versions-diff">
            <div className="am-versions-diff-toolbar">
                <div>
                    <span className="am-versions-diff-title">
                        {t('versions.version', { number: selected.versionNumber })}
                    </span>
                    <span className="am-versions-diff-subtitle">
                        {formatDatetime(selected.createdAt)}
                        {selected.createdBy != null && ` · ${selected.createdBy}`}
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

// ============================================================================
// Page
// ============================================================================

export function EntryVersionsPage({
    mount,
    id,
}: {
    mount: EntriesMount;
    id: string;
}): React.ReactElement {
    const { type, api, cacheScope, config: entryTypeConfig, basePath } = mount;
    const scope = { api, cacheScope };
    const confirm = useConfirm();
    const { t } = useTranslation();
    const navigate = useNavigate();

    const plural = entryTypeConfig?.plural ?? type;
    const hasTitle = entryTypeConfig?.titleField !== false;

    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

    const { data: entry } = useEntry(type, id, scope);

    const { data: rawVersions, isLoading } = useEntryVersions(type, id, true, scope);
    const versions =
        rawVersions !== undefined
            ? [...rawVersions].sort((a, b) => b.versionNumber - a.versionNumber)
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

    const restoreMutation = useRestoreEntryVersion(type, id, {
        ...scope,
        onSuccess: () => void navigate({ to: `${basePath}/${id}` }),
    });

    function handleRestore(): void {
        if (selectedVersion == null) return;
        confirm({
            title: t('versions.confirmRestoreTitle', {
                number: selectedVersion.versionNumber,
            }),
            description: t('versions.confirmRestoreMessage'),
            confirmLabel: t('versions.confirmRestoreLabel'),
            onConfirm: () => restoreMutation.mutate(selectedVersion.id),
        });
    }

    if (isLoading) {
        return <PageLoading />;
    }

    return (
        <Page>
            <PageHeader>
                <PageTitle>{t('versions.pageTitle')}</PageTitle>
                <Breadcrumb
                    items={[
                        { label: plural, to: basePath },
                        {
                            label: (hasTitle ? entry?.title : undefined) || id,
                            to: `${basePath}/${id}`,
                        },
                        { label: t('versions.pageTitle') },
                    ]}
                />
            </PageHeader>

            <PageContent>
                <div className="am-versions">
                    {/* Sidebar */}
                    <div className="am-versions-sidebar">
                        <div className="am-versions-sidebar-header">
                            <h2 className="am-versions-sidebar-title">
                                {t('versions.pageTitle')}
                            </h2>
                            <Link to={`${basePath}/${id}`} className="am-link am-text-sm">
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
                                onRestore={handleRestore}
                                isRestoring={restoreMutation.isPending}
                                hasTitle={hasTitle}
                            />
                        )}
                    </div>
                </div>
            </PageContent>
        </Page>
    );
}
