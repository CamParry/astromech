/**
 * Field lookups for media validation, mirroring `entries/lookups.ts`. `isUnique`
 * checks no OTHER media item holds `value` for `field` in the same locale: media
 * fields live in one JSON column, so this scans that locale's content rows in
 * memory.
 */

import type { MediaRepository } from '../repository';
import type { FieldLookups } from '@/types/fields';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';

export function createMediaLookups(
    repository: Pick<MediaRepository, 'listContent'>,
    scope: { locale: string; excludeId?: string | readonly string[] }
): FieldLookups {
    return fieldLookupsFromRecords({
        load: async () => repository.listContent(scope.locale),
        getId: (row) => row.id,
        getFields: (row) => row.fields,
        excludeId: scope.excludeId,
        entryTypes: (ids) => existingEntryTypes(ids),
    });
}
