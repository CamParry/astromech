import { z } from '@hono/zod-openapi';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../../internal/access';
import { getEntryResource } from '../../read-entry';
import { entryRepository } from '../../repository/entries-table';

/** A missing entry, or one of another type, throws. */
export const revokePreviewToken = defineServiceMethod({
    summary: 'Revoke the preview token of an entry.',
    input: revokePreviewTokenInput({ type: z.string() }),
    output: z.void(),
    access: entryAccess('update'),
    requires: 'staging',
    mutates: true,
    async handler(params): Promise<void> {
        const { type, id } = params;

        await getEntryResource(type, id);

        await entryRepository.previewToken.clear(id);
    },
});

/**
 * `entries.revokePreviewToken`'s input, with `type` as given: any type id on the
 * method, one type's literal in that type's catalogue.
 */
export function revokePreviewTokenInput<T extends z.ZodType>({ type }: { type: T }) {
    return z.strictObject({ type, id: z.string() });
}
