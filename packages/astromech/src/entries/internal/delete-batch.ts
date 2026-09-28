import type { EntryResource } from '../repository/types';
import type { AppContext } from '@/types/index';
import { relationshipRepository } from '@/content/repository/relationships';
import { parseOutput } from '@/services/parse-method-output';
import { getEntryResources } from '../read-entry';
import { entryRepository } from '../repository/entries-table';
import { entrySchema } from '../schema';
import { writeBatch } from './write-batch';

/**
 * Deletes a batch of entries with every locale and version, atomically, firing
 * the entry delete hooks around the write, for `delete`.
 */
export async function deleteEntryBatch(
    params: { type: string; ids: readonly string[] },
    ctx: AppContext
): Promise<void> {
    await removeEntryBatch(params, ctx, {
        permanent: true,
        async write(entry) {
            await relationshipRepository.deleteByResource(entry.id, 'entry');
            // Content rows and versions cascade from the `entries` row.
            await entryRepository.delete(entry.id);
        },
    });
}

/**
 * Moves a batch of entries with every locale to the trash, atomically, firing
 * the entry delete hooks around the write, for `trash`.
 */
export async function trashEntryBatch(
    params: { type: string; ids: readonly string[] },
    ctx: AppContext
): Promise<void> {
    const { user } = ctx;
    const userId = user?.id ?? null;

    await removeEntryBatch(params, ctx, {
        permanent: false,
        async write(entry) {
            // Keeps the relationship rows: a trashed entry can be restored.
            await entryRepository.trash.trash(entry.id, userId);
        },
    });
}

/**
 * Reads every entry, then fires `entry:beforeDelete` for each, runs `write` for
 * each in one transaction, and fires `entry:afterDelete` for each. A missing id,
 * or one of another type, throws before any hook fires.
 */
async function removeEntryBatch(
    params: { type: string; ids: readonly string[] },
    ctx: AppContext,
    options: {
        permanent: boolean;
        write: (entry: EntryResource) => Promise<void>;
    }
): Promise<void> {
    const { type, ids } = params;
    const { permanent, write } = options;
    const { user } = ctx;

    const entries = await getEntryResources(type, ids);

    for (const entry of entries) {
        await ctx.runHook('entry:beforeDelete', {
            type,
            entry: parseOutput(entrySchema, entry, 'The entry in entry:beforeDelete'),
            user,
            permanent,
        });
    }

    await writeBatch(entries, write);

    for (const entry of entries) {
        // A throw here propagates; the write above stays (`DECISIONS.md`).
        await ctx.runHook('entry:afterDelete', {
            type,
            entry: parseOutput(entrySchema, entry, 'The entry in entry:afterDelete'),
            user,
            permanent,
        });
    }
}
