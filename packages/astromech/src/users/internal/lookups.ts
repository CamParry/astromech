/**
 * Field lookups for user validation, mirroring `media/internal/lookups.ts`.
 * `isUnique` checks no OTHER user holds `value` for `field` in the same locale:
 * user fields live in one JSON column, so this scans that locale's content rows
 * in memory.
 */

import type { UserRepository } from '../repository';
import type { FieldLookups } from '@/types/fields';
import { existingEntryTypes } from '@/database/repository/resource-existence';
import { fieldLookupsFromRecords } from '@/fields/field-lookups';

export function createUserLookups(
    repository: Pick<UserRepository, 'listContent'>,
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
