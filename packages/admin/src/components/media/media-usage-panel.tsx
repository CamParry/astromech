/**
 * "Used by" panel — the entries, globals, users and media items that reference
 * one media item, grouped by source kind and entry type. `media.usedBy` resolves
 * display titles server-side, so this component only groups and links.
 */

import type { Usage } from 'astromech';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { useMediaUsage } from '../../hooks/media';
import { Link } from '../../rendering/cells/link';
import { entryAdminPath } from '../../utilities/entry-admin-path';
import { Spinner } from '../ui/spinner';

export type MediaUsagePanelProps = {
    mediaId: string;
};

/** One heading's worth of rows: all the references from one kind (and entry type). */
type UsageGroup = {
    key: string;
    sourceKind: Usage['sourceKind'];
    sourceType: string | null;
    rows: Usage[];
};

export function MediaUsagePanel({
    mediaId,
}: MediaUsagePanelProps): React.ReactElement | null {
    const { t } = useTranslation();
    const { data, isLoading } = useMediaUsage(mediaId);
    const rows = useMemo(() => data ?? [], [data]);
    const groups = useMemo(() => groupUsage(rows), [rows]);

    if (isLoading) {
        return (
            <div className="am-media-usage" aria-busy="true">
                <Spinner />
            </div>
        );
    }

    // An empty section is noise — a file nothing references shows nothing.
    if (rows.length === 0) return null;

    return (
        <section className="am-media-usage">
            <h3 className="am-media-usage-heading">
                {t('media.usedByHeader', { count: rows.length })}
            </h3>
            {groups.map((group) => (
                <div className="am-media-usage-group" key={group.key}>
                    <p className="am-media-usage-group-label">
                        {groupLabel(group, (key) => t(key))}
                    </p>
                    <ul className="am-media-usage-list">
                        {group.rows.map((row) => (
                            <li
                                className="am-media-usage-item"
                                key={`${row.sourceKind}-${row.sourceId}-${row.instancePath}`}
                            >
                                <span className="am-media-usage-source">
                                    <SourceName group={group} row={row} />
                                    {row.sourceStaged && (
                                        <span className="am-text-muted am-text-sm">
                                            {t('media.usedByStaged')}
                                        </span>
                                    )}
                                </span>
                                <span className="am-text-mono am-text-muted am-media-usage-path">
                                    {row.schemaPath}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </section>
    );
}

/** Entry sources link to their edit page; other kinds are named, not linked. */
function SourceName({
    group,
    row,
}: {
    group: UsageGroup;
    row: Usage;
}): React.ReactElement {
    // A source that would not load has no title, so its id is all there is.
    const label = row.sourceTitle === '' ? row.sourceId : row.sourceTitle;

    if (group.sourceKind !== 'entry' || group.sourceType === null) {
        return <span className="am-text-mono">{label}</span>;
    }
    return (
        <Link className="am-link" to={entryAdminPath(group.sourceType, row.sourceId)}>
            {label}
        </Link>
    );
}

/** Stable groups in the order the sorted rows arrive in. */
function groupUsage(rows: Usage[]): UsageGroup[] {
    const groups = new Map<string, UsageGroup>();
    for (const row of rows) {
        const key = `${row.sourceKind} ${row.sourceType ?? ''}`;
        const group = groups.get(key) ?? {
            key,
            sourceKind: row.sourceKind,
            sourceType: row.sourceType,
            rows: [],
        };
        group.rows.push(row);
        groups.set(key, group);
    }
    return Array.from(groups.values());
}

/** Entry groups use the type's plural label; the other kinds are translated. */
function groupLabel(group: UsageGroup, translate: (key: string) => string): string {
    if (group.sourceKind === 'global') return translate('media.usedBySourceGlobals');
    if (group.sourceKind === 'user') return translate('media.usedBySourceUsers');
    if (group.sourceKind === 'media') return translate('media.usedBySourceMedia');
    if (group.sourceType === null) return translate('media.usedBySourceEntries');
    return entryTypeLabel(group.sourceType) ?? group.sourceType;
}

/** The admin's plural label for a root or plugin entry type, or null if unknown. */
function entryTypeLabel(typeId: string): string | null {
    return Object.hasOwn(adminConfig.entryTypes, typeId)
        ? (adminConfig.entryTypes[typeId]?.plural ?? null)
        : null;
}
