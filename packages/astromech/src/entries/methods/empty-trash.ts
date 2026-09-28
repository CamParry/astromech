import { z } from '@hono/zod-openapi';
import { relationshipRepository } from '@/content/repository/relationships';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { entryRepository } from '../repository/entries-table';

/**
 * Deletes each trashed entry with every locale and version, clearing its
 * relationship rows first. No entry hooks fire.
 */
export const emptyTrash = defineServiceMethod({
    summary: 'Permanently delete every trashed entry of one type.',
    input: emptyTrashInput({ type: z.string() }),
    output: z.void(),
    access: entryAccess('delete'),
    requires: 'trash',
    mutates: true,
    destructive: true,
    idempotent: true,
    async handler(params): Promise<void> {
        const { type } = params;

        const trashed = await entryRepository.findMany({
            type,
            locale: 'all',
            trashed: true,
        });
        const ids = new Set(trashed.map((entry) => entry.id));

        await transaction(async () => {
            for (const id of ids) {
                await relationshipRepository.deleteByResource(id, 'entry');
            }
            await entryRepository.trash.emptyTrash(type);
        });
    },
});

/**
 * `entries.emptyTrash`'s input, with `type` as given: any type id on the method,
 * one type's literal in that type's catalogue.
 */
export function emptyTrashInput<T extends z.ZodType>({ type }: { type: T }) {
    return z.strictObject({ type });
}
