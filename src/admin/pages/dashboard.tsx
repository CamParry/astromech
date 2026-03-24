/**
 * Dashboard page — summary stat cards and recent activity.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { Panel, Badge, EmptyState, Skeleton, Page, PageTitle, SectionTitle, PageLoading } from '../components/ui/index.js';
import { Astromech } from '../../sdk/client/index.js';
import type { Entity } from '../../types/index.js';
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

function StatCard({ collectionKey, label }: { collectionKey: string; label: string }): React.ReactElement {
    const { data, isLoading } = useQuery({
        queryKey: ['collection-count', collectionKey],
        queryFn: () =>
            Astromech.collections[collectionKey]!.paginate(1, 1),
    });

    const total = data?.pagination.total ?? 0;

    return (
        <Panel>
            <div className="am-stat-card">
                <span className="am-stat-card__label">
                    {label}
                </span>
                {isLoading ? (
                    <Skeleton style={{ width: '3rem', height: '2rem' }} />
                ) : (
                    <span className="am-stat-card__value">
                        {total}
                    </span>
                )}
            </div>
        </Panel>
    );
}

// ============================================================================
// Recent activity
// ============================================================================

type RecentEntity = Entity & { collectionKey: string; collectionLabel: string };

type RecentActivityResult = {
    data: RecentEntity[];
    isLoading: boolean;
};

function useRecentEntities(): RecentActivityResult {
    const collectionKeys = Object.keys(adminConfig.collections);
    const collectionKeysStr = collectionKeys.join(',');

    const { data, isLoading } = useQuery({
        queryKey: ['recent-entities-all', collectionKeysStr],
        queryFn: async () => {
            const results = await Promise.all(
                collectionKeys.map(async (key) => {
                    const result = await Astromech.collections[key]!.paginate(5, 1, { sort: { field: 'updatedAt', direction: 'desc' } });
                    const collectionLabel = adminConfig.collections[key]?.plural ?? key;
                    return result.data.map((entity): RecentEntity => ({
                        ...entity,
                        collectionKey: key,
                        collectionLabel,
                    }));
                }),
            );
            const allEntities = results.flat();
            allEntities.sort((a, b) => {
                const aTime = new Date(a.updatedAt).getTime();
                const bTime = new Date(b.updatedAt).getTime();
                return bTime - aTime;
            });
            return allEntities.slice(0, 5);
        },
        enabled: collectionKeys.length > 0,
    });

    return { data: data ?? [], isLoading };
}

// ============================================================================
// Page
// ============================================================================

export function DashboardPage(): React.ReactElement {
    const { t } = useTranslation();
    const collections = adminConfig.collections;
    const collectionEntries = Object.entries(collections);
    const { data: recentEntities, isLoading: recentLoading } = useRecentEntities();

    return (
        <Page>
            <PageTitle>{t('dashboard.title')}</PageTitle>

            {/* Stat cards */}
            {collectionEntries.length > 0 && (
                <section>
                    <SectionTitle>
                        {t('dashboard.collections')}
                    </SectionTitle>
                    <div className="am-stat-grid">
                        {collectionEntries.map(([key, col]) => (
                            <Link
                                key={key}
                                to="/collections/$collection"
                                params={{ collection: key }}
                                className="am-link--inherit"
                            >
                                <StatCard collectionKey={key} label={col.plural} />
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Recent activity */}
            <section>
                <SectionTitle>
                    {t('dashboard.recentActivity')}
                </SectionTitle>
                <Panel>
                    {recentLoading ? (
                        <PageLoading />
                    ) : recentEntities.length === 0 ? (
                        <EmptyState
                            title={t('dashboard.noContentYet')}
                            description={t('dashboard.noContentDescription')}
                        />
                    ) : (
                        <ul className="am-activity-list">
                            {recentEntities.map((entity) => (
                                <li
                                    key={`${entity.collectionKey}-${entity.id}`}
                                    className="am-activity-list__item"
                                >
                                    <div className="am-activity-list__body">
                                        <Link
                                            to="/collections/$collection/$id"
                                            params={{ collection: entity.collectionKey, id: entity.id }}
                                            className="am-link"
                                        >
                                            {entity.title}
                                        </Link>
                                        <div className="am-activity-list__meta">
                                            {entity.collectionLabel} · {t('dashboard.updated', { date: formatDate(entity.updatedAt) })}
                                        </div>
                                    </div>
                                    <Badge variant={statusVariant(entity.status)}>
                                        {entity.status}
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </section>
        </Page>
    );
}
