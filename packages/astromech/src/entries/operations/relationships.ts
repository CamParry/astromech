/**
 * Reverse lookup for the delete modal: the entries that reference this one.
 * Reads the relationships index, then loads each source through its OWN type's
 * repository.
 */

import type { EntryRepository, EntryRow } from '../repository/types';
import type { IncomingRelationship } from '@/types/index';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { getEntryOfType } from '../internal/records';
import { getEntryRepository } from '../repository/registry';

/** One row per index edge: a source referencing the target twice is two rows. */
export async function listIncomingRelationships(params: {
    type: string;
    id: string;
}): Promise<IncomingRelationship[]> {
    const repository = getEntryRepository(params.type);
    await getEntryOfType(repository, params.type, params.id);

    // Staged sources count: a pending merge that references this entry is a
    // reason not to delete it.
    const rows = await createRelationshipRepository().findByTarget(params.id, 'entry', {
        includeStaged: true,
    });

    // An entry source always carries a `sourceType`; a null one is index
    // corruption, so drop it rather than guessing a repository for it.
    const sourceRows = rows.filter(
        (row): row is typeof row & { sourceType: string } =>
            row.sourceKind === 'entry' && typeof row.sourceType === 'string'
    );
    if (sourceRows.length === 0) return [];

    const sources = await loadSources(sourceRows);

    return sourceRows.flatMap((row) => {
        const source = sources.get(row.sourceId);
        if (source === undefined) return [];
        return [
            {
                sourceId: source.id,
                sourceTitle: source.title ?? '',
                sourceType: row.sourceType,
                schemaPath: row.schemaPath,
            } satisfies IncomingRelationship,
        ];
    });
}

/**
 * Load the sources grouped by their own entry type. Not batched through
 * `list()`: `buildListWhere` unconditionally excludes staged rows, which are
 * exactly the sources this call exists to surface.
 */
async function loadSources(
    rows: { sourceId: string; sourceType: string }[]
): Promise<Map<string, EntryRow>> {
    const idsByType = new Map<string, Set<string>>();
    for (const row of rows) {
        const ids = idsByType.get(row.sourceType) ?? new Set<string>();
        ids.add(row.sourceId);
        idsByType.set(row.sourceType, ids);
    }

    const loaded = new Map<string, EntryRow>();
    for (const [type, ids] of idsByType) {
        const repository = repositoryFor(type);
        if (repository === null) continue;
        const records = await Promise.all(
            Array.from(ids, (id) => repository.get(id, { includeTrashed: true }))
        );
        for (const record of records) {
            if (record !== null) loaded.set(record.id, record);
        }
    }
    return loaded;
}

/** A type dropped from config since its rows were written has no repository. */
function repositoryFor(type: string): EntryRepository | null {
    try {
        return getEntryRepository(type);
    } catch {
        return null;
    }
}
