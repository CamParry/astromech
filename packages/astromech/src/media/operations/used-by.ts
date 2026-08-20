/**
 * Reverse lookup for the delete modal: everything that references a media item.
 * Reads the relationships index, then names each source through its own domain.
 */

import type { RelationshipRow } from '@/database/tables';
import type { MediaUsage } from '@/types/index';
import { createRelationshipRepository } from '@/database/repository/relationships';
// Peer domains, read only to name a source row. See the `usedBy` docstring.
import { getEntryRepository } from '@/entries/repository/registry';
import { createUserRepository } from '@/users/repository';
import { createMediaRepository } from '../repository';

/**
 * Every relationships-index edge pointing at this media item — one row per
 * edge, so a source using the same file at two paths yields two rows. Titles
 * resolve here so this returns the same shape as `entries.incomingRelationships`.
 */
export async function usedBy(params: { id: string }): Promise<MediaUsage[]> {
    const { id } = params;
    const row = await createMediaRepository().get(id);
    if (!row) throw new Error(`Media '${id}' not found`);

    // Staged sources count: a pending merge that uses this file is a reason
    // not to delete it.
    const rows = await createRelationshipRepository().findByTarget(id, 'media', {
        includeStaged: true,
    });

    const titles = await resolveSourceTitles(rows);
    return rows
        .map(
            (edge): MediaUsage => ({
                sourceId: edge.sourceId,
                sourceKind: edge.sourceKind,
                sourceType: edge.sourceType,
                sourceTitle: titles.get(sourceTitleKey(edge)) ?? '',
                schemaPath: edge.schemaPath,
                instancePath: edge.instancePath,
                sourceStaged: edge.sourceStaged,
            })
        )
        .sort(compareUsage);
}

/**
 * Display name per source, keyed by kind+id. Entry sources load through
 * their own type's repository — the target's would silently miss sources
 * of another type. A source that fails to load keeps an empty title.
 */
async function resolveSourceTitles(
    rows: readonly RelationshipRow[]
): Promise<Map<string, string>> {
    const titles = new Map<string, string>();

    const entryIdsByType = new Map<string, Set<string>>();
    const userIds = new Set<string>();
    const mediaIds = new Set<string>();
    for (const row of rows) {
        if (row.sourceKind === 'user') userIds.add(row.sourceId);
        else if (row.sourceKind === 'media') mediaIds.add(row.sourceId);
        else if (row.sourceType !== null) {
            const ids = entryIdsByType.get(row.sourceType) ?? new Set<string>();
            ids.add(row.sourceId);
            entryIdsByType.set(row.sourceType, ids);
        }
    }

    for (const [type, ids] of entryIdsByType) {
        // A type dropped from config since its rows were written has no storage.
        let repository;
        try {
            repository = getEntryRepository(type);
        } catch {
            continue;
        }
        const records = await Promise.all(
            Array.from(ids, (entryId) =>
                repository.get(entryId, { includeTrashed: true })
            )
        );
        for (const record of records) {
            if (record !== null) titles.set(`entry ${record.id}`, record.title ?? '');
        }
    }

    const userRepository = createUserRepository();
    for (const userId of userIds) {
        const user = await userRepository.get(userId);
        if (user !== null) titles.set(`user ${userId}`, user.name || user.email);
    }

    const mediaRepository = createMediaRepository();
    for (const mediaId of mediaIds) {
        const item = await mediaRepository.get(mediaId);
        if (item !== null) titles.set(`media ${mediaId}`, item.filename);
    }

    return titles;
}

/** Kind+id, NUL-joined so no id can spell another kind's key. */
function sourceTitleKey(row: { sourceKind: string; sourceId: string }): string {
    return `${row.sourceKind} ${row.sourceId}`;
}

/** Stable panel order: the index itself has none, so reads would reshuffle. */
function compareUsage(a: MediaUsage, b: MediaUsage): number {
    return (
        a.sourceKind.localeCompare(b.sourceKind) ||
        (a.sourceType ?? '').localeCompare(b.sourceType ?? '') ||
        a.sourceId.localeCompare(b.sourceId) ||
        a.schemaPath.localeCompare(b.schemaPath) ||
        a.instancePath.localeCompare(b.instancePath)
    );
}
