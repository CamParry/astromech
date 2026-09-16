/**
 * The uniqueness check for media validation, mirroring `entries/unique.ts`: no
 * OTHER media item holds `value` for `field` in the same locale. Media fields
 * live in one JSON column, so this scans that locale's content rows in memory.
 */

import type { MediaRepository } from '../repository';
import type { Field } from '@/types/fields';
import { uniqueAmongRecords } from '@/fields/unique-among';

export function mediaIsUnique(
    repository: Pick<MediaRepository, 'listContent'>,
    scope: { locale: string; excludeId?: string | readonly string[] }
): (field: Field, value: unknown) => Promise<boolean> {
    return uniqueAmongRecords({
        load: async () => repository.listContent(scope.locale),
        getId: (row) => row.id,
        getFields: (row) => row.fields,
        excludeId: scope.excludeId,
    });
}
