/**
 * Dashboard page — summary stat cards and recent activity.
 */

import type { Entry } from 'astromech';
import { useQueries } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { Badge } from '../../components/ui/badge';
import { EmptyState } from '../../components/ui/empty-state';
import {
    Page,
    PageContent,
    PageHeader,
    PageLoading,
    PageTitle,
    SectionTitle,
} from '../../components/ui/page';
import { Panel } from '../../components/ui/panel';
import { Skeleton } from '../../components/ui/spinner';
import { useAiContext } from '../../context/ai-context';
import { entriesQueryOptions, useEntriesQuery } from '../../hooks/entries';
import { formatDate } from '../../utilities/dates';

function statusVariant(
    status: string
): 'unpublished' | 'published' | 'scheduled' | 'default' {
    if (status === 'unpublished') return 'unpublished';
    if (status === 'published') return 'published';
    if (status === 'scheduled') return 'scheduled';
    return 'default';
}

function StatCard({
    typeId,
    label,
}: {
    typeId: string;
    label: string;
}): React.ReactElement {
    const { data, isLoading } = useEntriesQuery({ type: typeId, limit: 1 });

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

type RecentEntry = Entry & { typeId: string; typeLabel: string };

type RecentActivityResult = {
    data: RecentEntry[];
    isLoading: boolean;
};

/** The site's own entry types; a plugin's are summarised on its own pages. */
const siteEntryTypes = Object.fromEntries(
    Object.entries(adminConfig.entryTypes).filter(
        ([, entryType]) => entryType.plugin === undefined
    )
);

/**
 * The five most recently updated entries across the site's types. Each type is
 * its own list query, so an entry mutation refreshes the type it touched.
 */
function useRecentEntries(): RecentActivityResult {
    return useQueries({
        queries: Object.keys(siteEntryTypes).map((type) =>
            entriesQueryOptions({ type, limit: 5, sort: { updatedAt: 'desc' } })
        ),
        combine: (results) => ({
            data: results
                .flatMap((result, index) => {
                    const typeId = Object.keys(siteEntryTypes)[index] ?? '';
                    const typeLabel = siteEntryTypes[typeId]?.plural ?? typeId;
                    return (result.data?.data ?? []).map(
                        (entry): RecentEntry => ({ ...entry, typeId, typeLabel })
                    );
                })
                .sort(
                    (a, b) =>
                        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                )
                .slice(0, 5),
            isLoading: results.some((result) => result.isLoading),
        }),
    });
}

function DashboardPage(): React.ReactElement {
    const { t } = useTranslation();
    const typeEntries = Object.entries(siteEntryTypes);
    const { data: recentEntries, isLoading: recentLoading } = useRecentEntries();

    useAiContext(
        { kind: 'pages', id: 'dashboard', label: t('dashboard.title') },
        { depth: 0 }
    );

    return (
        <Page>
            <PageHeader>
                <PageTitle>{t('dashboard.title')}</PageTitle>
            </PageHeader>

            <PageContent>
                {/* Stat cards */}
                {typeEntries.length > 0 && (
                    <section>
                        <SectionTitle>{t('dashboard.collections')}</SectionTitle>
                        <div className="am-stat-grid">
                            {typeEntries.map(([key, entryType]) => (
                                <Link
                                    key={key}
                                    to="/entries/$type"
                                    params={{ type: key }}
                                    className="am-link-inherit"
                                >
                                    <StatCard typeId={key} label={entryType.plural} />
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
                                        key={`${entry.typeId}-${entry.id}`}
                                        className="am-activity-list-item"
                                    >
                                        <div className="am-activity-list-body">
                                            <Link
                                                to="/entries/$type/$id"
                                                params={{
                                                    type: entry.typeId,
                                                    id: entry.id,
                                                }}
                                                className="am-link"
                                            >
                                                {entry.title}
                                            </Link>
                                            <div className="am-activity-list-meta">
                                                {entry.typeLabel} ·{' '}
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
