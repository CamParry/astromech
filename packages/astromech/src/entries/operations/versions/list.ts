import type { EntryVersion } from '@/types/index';
import { getEntryOfType } from '../../internal/records';
import { toEntryVersion } from '../../internal/versions';
import { getEntryRepository } from '../../repository/registry';

/**
 * Lists the saved versions of one locale of an entry. Returns an empty array
 * when the type keeps no version history. Throws if the entry does not exist,
 * has no row in that locale, or is the wrong type.
 */
export async function listEntryVersions(params: {
    type: string;
    id: string;
    locale?: string;
}): Promise<EntryVersion[]> {
    const repository = getEntryRepository(params.type);
    const record = await getEntryOfType(
        repository,
        params.type,
        params.id,
        params.locale
    );
    if (!repository.versions) return [];
    const rows = await repository.versions.list(record.contentId);
    return rows.map((row) => toEntryVersion(row, record));
}
