import type { EntryRepository } from './repository/types';
import type { DataField } from '@/types/fields';
import { uniqueAmongRecords } from '@/fields/unique-among';

/**
 * The uniqueness check for entry validation: no OTHER entry of the same
 * type+locale holds `value` for `field`. Entry fields live in one JSON column
 * (no per-field index), so this scans the type+locale in memory.
 */
export function entryIsUnique(
    repository: EntryRepository,
    scope: { type: string; locale: string; excludeId?: string | readonly string[] }
): (field: DataField, value: unknown) => Promise<boolean> {
    return uniqueAmongRecords({
        load: async () => {
            const { data } = await repository.list({
                type: scope.type,
                locale: scope.locale,
                trashed: false,
                limit: 'all',
            });
            return data;
        },
        getId: (record) => record.id,
        getFields: (record) => (record.fields ?? {}) as Record<string, unknown>,
        excludeId: scope.excludeId,
    });
}
