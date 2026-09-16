/**
 * The uniqueness check for user validation, mirroring `media/internal/unique.ts`:
 * no OTHER user holds `value` for `field` in the same locale. User fields live in
 * one JSON column, so this scans that locale's content rows in memory.
 */

import type { UserRepository } from '../repository';
import type { Field } from '@/types/fields';
import { uniqueAmongRecords } from '@/fields/unique-among';

export function userIsUnique(
    repository: Pick<UserRepository, 'listContent'>,
    scope: { locale: string; excludeId?: string | readonly string[] }
): (field: Field, value: unknown) => Promise<boolean> {
    return uniqueAmongRecords({
        load: async () => repository.listContent(scope.locale),
        getId: (row) => row.id,
        getFields: (row) => row.fields,
        excludeId: scope.excludeId,
    });
}
