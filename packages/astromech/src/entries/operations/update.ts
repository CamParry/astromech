import type { EntryRepository } from '../repository/types';
import type { Entry, EntryUpdateData, ResolvedEntryType } from '@/types/index';
import { getConfig } from '@/config/registry';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types.shared';
import { parseInput } from '@/errors/index';
import { runHook } from '@/hooks/index';
import { getCurrentUser } from '@/request-context/index';
import { BulkOperationError, UnknownEntryTypeError } from '../errors';
import { asEntry, loadEntries } from '../internal/records';
import { indexEntryRelationships } from '../internal/relationships';
import { uniqueSlugIfChanged } from '../internal/slug';
import { toStoredFields } from '../internal/stored-fields';
import { propagateSharedFields } from '../internal/translatable';
import { changesVersionedContent, snapshotVersion } from '../internal/versions';
import { getEntryRepository } from '../repository/registry';
import { updateEntrySchema } from '../schema';
import { isPublicBranded, PublicShapeWriteError } from '../visibility';

/**
 * Updates a batch of entries, atomically, firing the entry update hooks around
 * the write. A single id is a batch of one (decisions/0077). Throws if an id is
 * missing or of another type before any hook fires or any row is touched.
 */
export async function updateEntries(params: {
    type: string;
    ids: readonly string[];
    data: EntryUpdateData;
}): Promise<Entry[]> {
    if (params.data.fields !== undefined && isPublicBranded(params.data.fields)) {
        throw new PublicShapeWriteError();
    }
    const entryType = resolveEntryType(getConfig(), params.type);
    if (!entryType) {
        throw new UnknownEntryTypeError(params.type);
    }

    // A single slug across many ids would violate (type, locale) uniqueness.
    if (params.ids.length > 1 && params.data.slug !== undefined) {
        throw new Error(
            'Bulk update cannot set `slug`: a single value across multiple ids ' +
                'would violate (type, locale) slug uniqueness. Update slugs individually.'
        );
    }

    const repository = getEntryRepository(entryType.id);
    const user = await getCurrentUser();

    // Fetch each row once, at the top: this record feeds both the before-hook
    // context and updateOne (point 3 — no second load per id).
    const entries = await loadEntries(repository, entryType.id, params.ids);

    for (const entry of entries) {
        await runHook('entry:beforeUpdate', {
            type: entryType.id,
            entry,
            data: params.data,
            user,
        });
    }

    const results = await transaction(async () => {
        const out: Entry[] = [];
        const succeeded: string[] = [];
        for (const currentEntry of entries) {
            try {
                out.push(
                    await updateOne({
                        repository,
                        entryType,
                        currentEntry,
                        data: params.data,
                    })
                );
                succeeded.push(currentEntry.id);
            } catch (err) {
                throw new BulkOperationError({
                    failedId: currentEntry.id,
                    reason: err instanceof Error ? err.message : String(err),
                    succeededBefore: succeeded,
                    cause: err,
                });
            }
        }
        return out;
    });

    for (const entry of entries) {
        // A throw here propagates; the write above stays (decisions/0081).
        await runHook('entry:afterUpdate', {
            type: entryType.id,
            entry,
            data: params.data,
            user,
        });
    }

    return results;
}

/**
 * Updates one entry: validates the patch, versions the state it replaces,
 * writes the row, then re-indexes relationships and propagates shared fields.
 */
async function updateOne(params: {
    repository: EntryRepository;
    entryType: ResolvedEntryType;
    currentEntry: Entry;
    data: EntryUpdateData;
}): Promise<Entry> {
    const { repository, entryType, currentEntry, data } = params;

    const titled = entryType.titleField !== false;
    const validated = parseInput(updateEntrySchema({ titled }), data);

    const patch = validated.fields;
    const patchedFieldNames = patch ? getPatchedFieldNames(patch) : [];
    const fields = patch
        ? await toStoredFields({
              kind: 'update',
              repository,
              entryType,
              currentEntry,
              patch,
              patchedFieldNames,
              status: validated.status,
          })
        : undefined;

    // Snapshot before the slug is uniquified, so the version compares what the caller sent.
    if (
        entryType.capabilities.versioning &&
        repository.versions &&
        changesVersionedContent(currentEntry, {
            title: validated.title,
            slug: validated.slug,
            fields,
        })
    ) {
        await snapshotVersion(repository.versions, currentEntry);
    }

    const publishedAt =
        validated.status === 'published' && !currentEntry.publishedAt
            ? new Date()
            : validated.publishedAt;
    const slug = await uniqueSlugIfChanged(
        repository,
        entryType.id,
        currentEntry,
        validated.slug
    );

    const entry = asEntry(
        await repository.update(currentEntry.id, {
            title: validated.title,
            slug,
            fields,
            status: validated.status,
            publishedAt,
        })
    );
    if (fields) {
        await indexEntryRelationships(entry, fields, entryType.id);
        await propagateSharedFields({
            repository,
            entryType,
            entry: currentEntry,
            fields,
            patchedFieldNames,
        });
    }
    return entry;
}

/** Root field names the caller actually sent; an `undefined` value is absent. */
function getPatchedFieldNames(patch: Record<string, unknown>): string[] {
    return Object.keys(patch).filter((name) => patch[name] !== undefined);
}
