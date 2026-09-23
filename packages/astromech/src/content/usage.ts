/**
 * The reverse lookup every resource's `usedBy` answers: each reference in the
 * relationships index pointing at one target, named through its source's own
 * rows. Staged sources count, since a pending merge is a reason not to delete.
 */

import type { RelationshipRow } from '@/database/tables';
import type { ResolvedConfig, TargetKind, Usage } from '@/types/index';
import { createRepository } from '@/database/repository/create-repository';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { mediaTable, usersTable } from '@/database/tables';
import { getEntryResource } from '@/entries/internal/records';
import { getEntryRepository } from '@/entries/repository/registry';
import { findGlobal } from '@/globals/internal/global';

/**
 * Every reference pointing at one target, one row per reference: a source using
 * the target at two paths yields two rows. The caller has already answered a
 * missing target with a 404.
 */
export async function listUsage(
    config: ResolvedConfig,
    target: { id: string; kind: TargetKind }
): Promise<Usage[]> {
    const rows = await createRelationshipRepository().findByTarget(
        target.id,
        target.kind,
        { includeStaged: true }
    );
    const titles = await loadSourceTitles(config, rows);
    return rows
        .map(
            (row): Usage => ({
                sourceId: row.sourceId,
                sourceKind: row.sourceKind,
                sourceType: row.sourceType,
                sourceTitle: titles.get(sourceKey(row)) ?? '',
                schemaPath: row.schemaPath,
                instancePath: row.instancePath,
                sourceStaged: row.sourceStaged,
            })
        )
        .sort(compareUsage);
}

/**
 * Display name per source, keyed by kind and id. An entry loads through its own
 * type's repository, in the locale it displays under; a global is named by its
 * label; users and media are read in batches. A source that fails to load keeps
 * an empty title rather than dropping out, since its reference still counts.
 */
async function loadSourceTitles(
    config: ResolvedConfig,
    rows: readonly RelationshipRow[]
): Promise<Map<string, string>> {
    const titles = new Map<string, string>();

    const entryIdsByType = new Map<string, Set<string>>();
    const userIds = new Set<string>();
    const mediaIds = new Set<string>();
    for (const row of rows) {
        if (row.sourceKind === 'entry' && row.sourceType !== null) {
            const ids = entryIdsByType.get(row.sourceType) ?? new Set<string>();
            ids.add(row.sourceId);
            entryIdsByType.set(row.sourceType, ids);
        } else if (row.sourceKind === 'global' && row.sourceType !== null) {
            const label = findGlobal(config, row.sourceType)?.label;
            titles.set(
                sourceKey(row),
                typeof label === 'string' ? label : row.sourceType
            );
        } else if (row.sourceKind === 'user') {
            userIds.add(row.sourceId);
        } else if (row.sourceKind === 'media') {
            mediaIds.add(row.sourceId);
        }
    }

    for (const [type, ids] of entryIdsByType) {
        for (const [id, title] of await entryTitles(config, type, ids)) {
            titles.set(sourceKey({ sourceKind: 'entry', sourceId: id }), title);
        }
    }

    // A name or an email is all a title needs, so the account row is enough.
    const accounts = createRepository(usersTable);
    for (const ids of chunks(userIds)) {
        for (const user of await accounts.findMany({ where: { id: { in: ids } } })) {
            titles.set(
                sourceKey({ sourceKind: 'user', sourceId: user.id }),
                user.name || user.email
            );
        }
    }

    // The filename lives on the file row, so the content join is not needed.
    const files = createRepository(mediaTable);
    for (const ids of chunks(mediaIds)) {
        for (const item of await files.findMany({ where: { id: { in: ids } } })) {
            titles.set(
                sourceKey({ sourceKind: 'media', sourceId: item.id }),
                item.filename
            );
        }
    }

    return titles;
}

/**
 * Titles for one entry type's sources. Read one at a time through the type's own
 * repository, not batched through `list()`, which excludes trashed entries: the
 * sources a delete check has to surface.
 */
async function entryTitles(
    config: ResolvedConfig,
    type: string,
    ids: ReadonlySet<string>
): Promise<Map<string, string>> {
    const titles = new Map<string, string>();
    // A type dropped from config since its rows were written has no repository.
    let repository;
    try {
        repository = getEntryRepository(type);
    } catch {
        return titles;
    }
    const records = await Promise.all(
        Array.from(ids, async (id) => {
            try {
                return await getEntryResource(config, repository, type, id);
            } catch {
                return null;
            }
        })
    );
    for (const record of records) {
        if (record !== null) titles.set(record.id, record.title);
    }
    return titles;
}

/** D1 caps a query at 100 bound parameters, and each id binds one. */
const ID_CHUNK = 100;

/** The ids in slices small enough for one `IN (…)` each. */
function chunks(ids: ReadonlySet<string>): string[][] {
    const all = Array.from(ids);
    const slices: string[][] = [];
    for (let i = 0; i < all.length; i += ID_CHUNK) {
        slices.push(all.slice(i, i + ID_CHUNK));
    }
    return slices;
}

/** Kind and id, NUL-joined so no id can spell another kind's key. */
function sourceKey(row: { sourceKind: string; sourceId: string }): string {
    return `${row.sourceKind}\0${row.sourceId}`;
}

/** A stable order: the index itself has none, so reads would reshuffle. */
function compareUsage(a: Usage, b: Usage): number {
    return (
        a.sourceKind.localeCompare(b.sourceKind) ||
        (a.sourceType ?? '').localeCompare(b.sourceType ?? '') ||
        a.sourceId.localeCompare(b.sourceId) ||
        a.schemaPath.localeCompare(b.schemaPath) ||
        a.instancePath.localeCompare(b.instancePath)
    );
}
