/**
 * Entry version history page.
 *
 * Two-column layout: version list sidebar left, diff view right.
 */

import React, { useState } from 'react';
import { useParams, useNavigate, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import adminConfig from 'virtual:astromech/admin-config';
import {
    Button,
    Panel,
    Breadcrumb,
    PageLoading,
    useToast,
    useConfirm,
    Page,
    PageHeader,
    PageContent,
} from '../../components/ui/index';
import { Astromech } from '../../../sdk/fetch/index.js';
import { queryKeys } from '../../hooks/index.js';
import type { EntryVersion } from '../../../types/index.js';

// ============================================================================
// Helpers
// ============================================================================

function formatVersionDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

type DiffEntry = {
    field: string;
    oldValue: unknown;
    newValue: unknown;
};

function computeDiff(older: EntryVersion | null, newer: EntryVersion): DiffEntry[] {
    const olderFields: Record<string, unknown> = {
        title: older?.title ?? '',
        slug: older?.slug ?? '',
        status: older?.status ?? '',
        ...(older?.fields ?? {}),
    };
    const newerFields: Record<string, unknown> = {
        title: newer.title,
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
            <pre className="am-versions__diff-pre">{JSON.stringify(value, null, 2)}</pre>
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
            className={[
                'am-versions__item',
                isSelected ? 'am-versions__item--selected' : '',
            ]
                .filter(Boolean)
                .join(' ')}
            onClick={onClick}
        >
            <div className="am-versions__item-header">
                <span className="am-versions__item-number">#{version.versionNumber}</span>
            </div>
            <div className="am-versions__item-date">
                {formatVersionDate(version.createdAt)}
            </div>
            {version.createdBy != null && (
                <div className="am-versions__item-author">{version.createdBy}</div>
            )}
        </button>
    );
}

type DiffViewProps = {
    selected: EntryVersion;
    previous: EntryVersion | null;
    onRestore: () => void;
    isRestoring: boolean;
};

function DiffView({
    selected,
    previous,
    onRestore,
    isRestoring,
}: DiffViewProps): React.ReactElement {
    const { t } = useTranslation();
    const diff = computeDiff(previous, selected);

    return (
        <div className="am-versions__diff">
            <div className="am-versions__diff-toolbar">
                <div>
                    <span className="am-versions__diff-title">
                        {t('versions.version', { number: selected.versionNumber })}
                    </span>
                    <span className="am-versions__diff-subtitle">
                        {formatVersionDate(selected.createdAt)}
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
                <div className="am-versions__diff-fields">
                    {diff.map((entry) => (
                        <div key={entry.field} className="am-versions__diff-field">
                            <div className="am-versions__diff-field-name">
                                {entry.field}
                            </div>
                            <div className="am-versions__diff-columns">
                                {previous != null && (
                                    <>
                                        <div className="am-versions__diff-old">
                                            {renderFieldValue(entry.oldValue)}
                                        </div>
                                        <ArrowRight
                                            size={14}
                                            className="am-versions__diff-arrow"
                                        />
                                    </>
                                )}
                                <div className="am-versions__diff-new">
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

export function EntryVersionsPage(): React.ReactElement {
    const { type, id } = useParams({ strict: false }) as {
        type: string;
        id: string;
    };
    const { toast } = useToast();
    const confirm = useConfirm();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const entryTypeConfig = adminConfig.entries[type];
    const plural = entryTypeConfig?.plural ?? type;

    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

    const { data: entry } = useQuery({
        queryKey: queryKeys.entries.detail(type, id),
        queryFn: () => Astromech.entries.get(id),
    });

    const { data: versions, isLoading } = useQuery({
        queryKey: queryKeys.entries.versions(type, id),
        queryFn: () => Astromech.entries.versions(id),
        select: (data) => [...data].sort((a, b) => b.versionNumber - a.versionNumber),
    });

    // Auto-select the first (latest) version on load
    const resolvedSelectedId =
        selectedVersionId ??
        (versions != null && versions.length > 0 ? versions[0]!.id : null);

    const selectedVersion = versions?.find((v) => v.id === resolvedSelectedId) ?? null;
    const selectedIndex = versions?.findIndex((v) => v.id === resolvedSelectedId) ?? -1;
    // Previous version in sorted array = the one after selected (older)
    const previousVersion =
        selectedIndex >= 0 && versions != null
            ? (versions[selectedIndex + 1] ?? null)
            : null;

    const restoreMutation = useMutation({
        mutationFn: (versionId: string) =>
            Astromech.entries.restoreVersion(id, versionId),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.detail(type, id),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.versions(type, id),
            });
            toast({ message: t('versions.restored'), variant: 'success' });
            void navigate({ to: `/entries/${type}/${id}` });
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('versions.restoreFailed'),
                variant: 'error',
            });
        },
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
                <Breadcrumb
                    items={[
                        { label: plural, to: `/entries/${type}` },
                        {
                            label: entry?.title ?? id,
                            to: `/entries/${type}/${id}`,
                        },
                        { label: t('versions.pageTitle') },
                    ]}
                />
            </PageHeader>

            <PageContent>
                <div className="am-versions">
                    {/* Sidebar */}
                    <div className="am-versions__sidebar">
                        <div className="am-versions__sidebar-header">
                            <h2 className="am-versions__sidebar-title">
                                {t('versions.pageTitle')}
                            </h2>
                            <Link
                                to="/entries/$type/$id"
                                params={{ type, id }}
                                className="am-link am-text-sm"
                            >
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
                            <div className="am-versions__list">
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
                    <div className="am-versions__main">
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
                            />
                        )}
                    </div>
                </div>
            </PageContent>
        </Page>
    );
}
