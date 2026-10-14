/**
 * The reverse lookup every resource's `usedBy` answers: each reference in the
 * relationships index pointing at one target, in any locale, named through its
 * source's own rows. Staged sources count, since a pending merge is a reason not
 * to delete.
 */

import type { RelationshipRow } from '@/database/tables';
import type { ResolvedConfig, TargetType, Usage } from '@/types/index';
import { relationshipRepository } from '@/content/repository/relationships';
import { getEntryResource } from '@/entries/read-entry';
import { resolveGlobal } from '@/globals/resolve-global';
import { mediaRepository } from '@/media/repository';
import { userRepository } from '@/users/repository';

/**
 * Every reference pointing at one target, one row per reference: a source using
 * the target at two paths yields two rows. The index holds a row per locale, and
 * the locales holding one reference fold into its `locales`. The caller has
 * already answered a missing target with a 404.
 */
export async function listUsage(
    config: ResolvedConfig,
    target: { id: string; type: TargetType }
): Promise<Usage[]> {
    const rows = await relationshipRepository.findByTarget(target.id, target.type, {
        includeStaged: true,
    });
    const titles = await loadSourceTitles(config, rows);

    const byReference = new Map<string, Usage>();
    for (const row of rows) {
        const key = `${sourceKey(row)}\0${row.instancePath}`;
        const held = byReference.get(key);
        if (held === undefined) {
            byReference.set(key, {
                sourceId: row.sourceId,
                sourceType: row.sourceType,
                sourceSubtype: row.sourceSubtype,
                sourceTitle: titles.get(sourceKey(row)) ?? '',
                schemaPath: row.schemaPath,
                instancePath: row.instancePath,
                locales: [row.locale],
                sourceStaged: row.sourceStaged,
            });
            continue;
        }
        held.locales.push(row.locale);
        // Staged only when no locale holding it holds it in canonical content.
        held.sourceStaged &&= row.sourceStaged;
    }

    const usage = Array.from(byReference.values());
    for (const row of usage) row.locales.sort();
    return usage.sort(compareUsage);
}

/**
 * Display name per source, keyed by type and id. An entry loads through its own
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
        if (row.sourceType === 'entry' && row.sourceSubtype !== null) {
            const ids = entryIdsByType.get(row.sourceSubtype) ?? new Set<string>();
            ids.add(row.sourceId);
            entryIdsByType.set(row.sourceSubtype, ids);
        } else if (row.sourceType === 'global' && row.sourceSubtype !== null) {
            const label = resolveGlobal(config, row.sourceSubtype)?.label;
            titles.set(
                sourceKey(row),
                typeof label === 'string' ? label : row.sourceSubtype
            );
        } else if (row.sourceType === 'user') {
            userIds.add(row.sourceId);
        } else if (row.sourceType === 'media') {
            mediaIds.add(row.sourceId);
        }
    }

    for (const [type, ids] of entryIdsByType) {
        for (const [id, title] of await entryTitles(type, ids)) {
            titles.set(sourceKey({ sourceType: 'entry', sourceId: id }), title);
        }
    }

    // A name or an email is all a title needs, so the `users` row is enough.
    for (const user of await userRepository.findUserRows(userIds)) {
        titles.set(
            sourceKey({ sourceType: 'user', sourceId: user.id }),
            user.name || user.email
        );
    }

    // The filename lives on the file row, so the content join is not needed.
    for (const item of await mediaRepository.findFiles(mediaIds)) {
        titles.set(sourceKey({ sourceType: 'media', sourceId: item.id }), item.filename);
    }

    return titles;
}

/**
 * Titles for one entry type's sources. Read one at a time, not batched through
 * `findMany`, which excludes trashed entries: the sources a delete check has to
 * surface.
 */
async function entryTitles(
    type: string,
    ids: ReadonlySet<string>
): Promise<Map<string, string>> {
    const titles = new Map<string, string>();
    const records = await Promise.all(
        Array.from(ids, async (id) => {
            try {
                return await getEntryResource(type, id);
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

/** Type and id, NUL-joined so no id can spell another type's key. */
function sourceKey(row: { sourceType: string; sourceId: string }): string {
    return `${row.sourceType}\0${row.sourceId}`;
}

/** A stable order: the index itself has none, so reads would reshuffle. */
function compareUsage(a: Usage, b: Usage): number {
    return (
        a.sourceType.localeCompare(b.sourceType) ||
        (a.sourceSubtype ?? '').localeCompare(b.sourceSubtype ?? '') ||
        a.sourceId.localeCompare(b.sourceId) ||
        a.schemaPath.localeCompare(b.schemaPath) ||
        a.instancePath.localeCompare(b.instancePath)
    );
}
