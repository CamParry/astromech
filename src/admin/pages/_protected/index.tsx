/**
 * Dashboard page — summary stat cards and recent activity.
 */

import React from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import {
    Panel,
    Badge,
    EmptyState,
    Skeleton,
    Page,
    PageTitle,
    SectionTitle,
    PageLoading,
    PageHeader,
    PageContent,
} from '@/admin/components/ui/index.js';
import { Astromech } from '@/sdk/fetch/index.js';
import type { Entry } from '@/types/index.js';
import { formatDate } from '@/support/dates.js';

// ============================================================================
// Helpers
// ============================================================================

function statusVariant(status: string): 'draft' | 'published' | 'scheduled' | 'default' {
    if (status === 'draft') return 'draft';
    if (status === 'published') return 'published';
    if (status === 'scheduled') return 'scheduled';
    return 'default';
}

// ============================================================================
// Collection stat card
// ============================================================================

function StatCard({
    collectionKey,
    label,
}: {
    collectionKey: string;
    label: string;
}): React.ReactElement {
    const { data, isLoading } = useQuery({
        queryKey: ['collection-count', collectionKey],
        queryFn: () => Astromech.entries.query({ type: collectionKey, limit: 1 }),
    });

    const total = data?.pagination?.total ?? 0;

    return (
        <Panel>
            <div className="am-stat-card">
                <span className="am-stat-card-label">{label}</span>
                {isLoading ? (
                    <Skeleton style={{ width: '3rem', height: '2rem' }} />
                ) : (
                    <span className="am-stat-card-value">{total}</span>
                )}
            </div>
        </Panel>
    );
}

// ============================================================================
// Recent activity
// ============================================================================

type RecentEntry = Entry & { collectionKey: string; collectionLabel: string };

type RecentActivityResult = {
    data: RecentEntry[];
    isLoading: boolean;
};

function useRecentEntries(): RecentActivityResult {
    const collectionKeys = Object.keys(adminConfig.entries);
    const collectionKeysStr = collectionKeys.join(',');

    const { data, isLoading } = useQuery({
        queryKey: ['recent-entries-all', collectionKeysStr],
        queryFn: async () => {
            const results = await Promise.all(
                collectionKeys.map(async (key) => {
                    const result = await Astromech.entries.query({
                        type: key,
                        limit: 5,
                        sort: { updatedAt: 'desc' },
                    });
                    const collectionLabel = adminConfig.entries[key]?.plural ?? key;
                    return result.data.map(
                        (entry): RecentEntry => ({
                            ...entry,
                            collectionKey: key,
                            collectionLabel,
                        })
                    );
                })
            );
            const allEntries = results.flat();
            allEntries.sort((a, b) => {
                const aTime = new Date(a.updatedAt).getTime();
                const bTime = new Date(b.updatedAt).getTime();
                return bTime - aTime;
            });
            return allEntries.slice(0, 5);
        },
        enabled: collectionKeys.length > 0,
    });

    return { data: data ?? [], isLoading };
}

// ============================================================================
// Page
// ============================================================================

function DashboardPage(): React.ReactElement {
    const { t } = useTranslation();
    const collections = adminConfig.entries;
    const collectionEntries = Object.entries(collections);
    const { data: recentEntries, isLoading: recentLoading } = useRecentEntries();

    return (
        <Page>
            <PageHeader>
                <PageTitle>{t('dashboard.title')}</PageTitle>
            </PageHeader>

            <PageContent>
                {/* Stat cards */}
                {collectionEntries.length > 0 && (
                    <section>
                        <SectionTitle>{t('dashboard.collections')}</SectionTitle>
                        <div className="am-stat-grid">
                            {collectionEntries.map(([key, col]) => (
                                <Link
                                    key={key}
                                    to="/entries/$type"
                                    params={{ type: key }}
                                    className="am-link-inherit"
                                >
                                    <StatCard collectionKey={key} label={col.plural} />
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {/* Recent activity */}
                <section>
                    <SectionTitle>{t('dashboard.recentActivity')}</SectionTitle>
                    <Panel>
                        {recentLoading ? (
                            <PageLoading />
                        ) : recentEntries.length === 0 ? (
                            <EmptyState
                                title={t('dashboard.noContentYet')}
                                description={t('dashboard.noContentDescription')}
                            />
                        ) : (
                            <ul className="am-activity-list">
                                {recentEntries.map((entry) => (
                                    <li
                                        key={`${entry.collectionKey}-${entry.id}`}
                                        className="am-activity-list-item"
                                    >
                                        <div className="am-activity-list-body">
                                            <Link
                                                to="/entries/$type/$id"
                                                params={{
                                                    type: entry.collectionKey,
                                                    id: entry.id,
                                                }}
                                                className="am-link"
                                            >
                                                {entry.title}
                                            </Link>
                                            <div className="am-activity-list-meta">
                                                {entry.collectionLabel} ·{' '}
                                                {t('dashboard.updated', {
                                                    date: formatDate(entry.updatedAt),
                                                })}
                                            </div>
                                        </div>
                                        <Badge variant={statusVariant(entry.status)}>
                                            {entry.status}
                                        </Badge>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </section>
            </PageContent>
        </Page>
    );
}

export const Route = createFileRoute('/_protected/')({
    component: DashboardPage,
});
