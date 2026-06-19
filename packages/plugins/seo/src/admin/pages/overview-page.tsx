/**
 * SEO overview dashboard (`/admin/plugin/seo/overview`): SEO health totals
 * plus a per-entry breakdown across the plugin footprint, fed by the
 * `overview` SDK method.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BadgeVariant } from 'astromech/ui';
import { Badge, EmptyState, Spinner, Table, useAstromechPlugin } from 'astromech/ui';
import type { LengthStatus } from '../../utilities/length.js';
import type { SeoOverview } from '../../types.js';
import './overview-page.css';

const STATUS_VARIANTS: Record<LengthStatus, BadgeVariant> = {
    empty: 'neutral',
    short: 'warning',
    good: 'success',
    long: 'danger',
};

function HealthBadge({ status }: { status: LengthStatus }): React.ReactElement {
    const { t } = useAstromechPlugin();
    return (
        <Badge variant={STATUS_VARIANTS[status]}>{t(`overview.health.${status}`)}</Badge>
    );
}

export default function SeoOverviewPage(): React.ReactElement {
    const { sdk, t, navigate } = useAstromechPlugin();
    const seoSdk = sdk as { overview: () => Promise<SeoOverview> };

    const { data, isLoading, isError } = useQuery({
        queryKey: ['plugin', 'seo', 'overview'],
        queryFn: () => seoSdk.overview(),
    });

    if (isLoading) {
        return <Spinner size="md" />;
    }

    if (isError || !data) {
        return (
            <div className="am-banner am-banner-error" role="alert">
                {t('overview.loadError')}
            </div>
        );
    }

    if (data.items.length === 0) {
        return (
            <EmptyState
                title={t('overview.emptyTitle')}
                description={t('overview.emptyDescription')}
            />
        );
    }

    return (
        <div className="am-seo-overview">
            <div className="am-seo-overview-totals">
                <div className="am-seo-overview-total">
                    <span className="am-seo-overview-total-value">
                        {data.totals.entries}
                    </span>
                    <span className="am-seo-overview-total-label">
                        {t('overview.totals.entries')}
                    </span>
                </div>
                <div className="am-seo-overview-total">
                    <span className="am-seo-overview-total-value am-seo-overview-total-value--good">
                        {data.totals.complete}
                    </span>
                    <span className="am-seo-overview-total-label">
                        {t('overview.totals.complete')}
                    </span>
                </div>
                <div className="am-seo-overview-total">
                    <span className="am-seo-overview-total-value am-seo-overview-total-value--attention">
                        {data.totals.needsAttention}
                    </span>
                    <span className="am-seo-overview-total-label">
                        {t('overview.totals.needsAttention')}
                    </span>
                </div>
            </div>

            <Table.Root>
                <Table.Head>
                    <Table.Row>
                        <Table.Th>{t('overview.columns.entry')}</Table.Th>
                        <Table.Th>{t('overview.columns.type')}</Table.Th>
                        <Table.Th>{t('overview.columns.status')}</Table.Th>
                        <Table.Th>{t('overview.columns.metaTitle')}</Table.Th>
                        <Table.Th>{t('overview.columns.metaDescription')}</Table.Th>
                    </Table.Row>
                </Table.Head>
                <Table.Body>
                    {data.items.map((item) => (
                        <Table.Row
                            key={item.id}
                            href={`/entries/${item.type}/${item.id}`}
                            onClick={() =>
                                void navigate({
                                    to: '/entries/$type/$id',
                                    params: { type: item.type, id: item.id },
                                })
                            }
                        >
                            <Table.Td>{item.title}</Table.Td>
                            <Table.Td>{item.type}</Table.Td>
                            <Table.Td>
                                <Badge
                                    variant={
                                        item.entryStatus === 'published'
                                            ? 'published'
                                            : 'unpublished'
                                    }
                                >
                                    {item.entryStatus}
                                </Badge>
                            </Table.Td>
                            <Table.Td>
                                <HealthBadge status={item.metaTitle.status} />
                            </Table.Td>
                            <Table.Td>
                                <HealthBadge status={item.metaDescription.status} />
                            </Table.Td>
                        </Table.Row>
                    ))}
                </Table.Body>
            </Table.Root>
        </div>
    );
}
