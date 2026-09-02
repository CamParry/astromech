import type { EntryRecord } from '../internal/records';
import type { EntryRepository } from '../repository/types';
import type {
    Entry,
    EntryCreateContext,
    EntryUpdateData,
    ResolvedEntryType,
} from '@/types/index';
import { getDefaultContentLocale } from '@/config/content-locale';
import { getConfig } from '@/config/registry';
import { isPublicBranded, PublicShapeWriteError } from '@/content/visibility';
import { transaction } from '@/database/transaction';
import { resolveEntryType } from '@/entries/entry-types.shared';
import { parseInput, ValidationError } from '@/errors/validation';
import { runHook } from '@/hooks/hooks';
import { getCurrentUser } from '@/request-context/request-context';
import {
    BulkOperationError,
    CapabilityError,
    EntryNotFoundError,
    UnknownEntryTypeError,
} from '../errors';
import { asEntry, asRecord, findEntryOfType, getEntryOfType } from '../internal/records';
import { indexEntryRelationships } from '../internal/relationships';
import { deriveSlug, uniqueSlugIfChanged } from '../internal/slug';
import { toStoredFields } from '../internal/stored-fields';
import { propagateSharedFields } from '../internal/translatable';
import { changesVersionedContent, snapshotVersion } from '../internal/versions';
import { getEntryRepository } from '../repository/registry';
import { createEntrySchema, updateEntrySchema } from '../schema';

/**
 * Updates one locale of a batch of entries, atomically, firing the entry write
 * hooks around it. A single id is a batch of one (`DECISIONS.md`). A locale with
 * no content row yet is created from the default-locale row (unless
 * `createMissingLocale` is false), which is how a translation is written;
 * `staged` writes the staged change instead.
 */
export async function updateEntries(params: {
    type: string;
    ids: readonly string[];
    locale?: string;
    /** Write each entry's staged change for this locale instead of its canonical row. */
    staged?: boolean;
    /**
     * Write a locale with no content row yet, creating it. Only `update` sets
     * it: a status change addresses a row that must already exist.
     */
    createMissingLocale?: boolean;
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

    const defaultLocale = getDefaultContentLocale();
    const locale = params.locale ?? defaultLocale;
    if (locale !== defaultLocale && !entryType.translatable) {
        throw ValidationError.fromFieldErrors({}, [
            `Entry type '${entryType.id}' is not translatable, so only the ` +
                `'${defaultLocale}' locale can be written.`,
        ]);
    }

    const repository = getEntryRepository(entryType.id);
    const user = await getCurrentUser();

    // Each id is read once, at the top: the record feeds both the before-hook
    // context and the write, so nothing loads twice. An id with no row in this
    // locale becomes a translation, planned here for the same reason.
    const staging = params.staged === true ? repository.staging : undefined;
    if (params.staged === true && !staging) {
        throw new CapabilityError(entryType.id, 'staging');
    }

    const plans: UpdatePlan[] = [];
    for (const id of params.ids) {
        const record = staging
            ? await getStagedRecord(staging, id, locale)
            : await findEntryOfType(repository, entryType.id, id, locale);
        if (!record && params.createMissingLocale === false) {
            throw new EntryNotFoundError({ entryId: id, locale });
        }
        plans.push(
            record
                ? { kind: 'update', id, record }
                : {
                      kind: 'translate',
                      id,
                      write: await planTranslation({
                          repository,
                          entryType,
                          id,
                          locale,
                          data: params.data,
                          user: user?.id ?? null,
                      }),
                  }
        );
    }

    for (const plan of plans) {
        if (plan.kind === 'update') {
            await runHook('entry:beforeUpdate', {
                type: entryType.id,
                entry: asEntry(plan.record),
                data: params.data,
                user,
            });
        } else {
            await runHook('entry:beforeCreate', {
                type: entryType.id,
                data: plan.write,
                user,
            });
        }
    }

    const results = await transaction(async () => {
        const out: Entry[] = [];
        const succeeded: string[] = [];
        for (const plan of plans) {
            try {
                out.push(
                    plan.kind === 'update'
                        ? await updateOne({
                              repository,
                              entryType,
                              currentEntry: plan.record,
                              data: params.data,
                              updatedBy: user?.id ?? null,
                              staging,
                          })
                        : await writeTranslation({
                              repository,
                              type: entryType.id,
                              id: plan.id,
                              locale,
                              write: plan.write,
                          })
                );
                succeeded.push(plan.id);
            } catch (err) {
                throw new BulkOperationError({
                    failedId: plan.id,
                    reason: err instanceof Error ? err.message : String(err),
                    succeededBefore: succeeded,
                    cause: err,
                });
            }
        }
        return out;
    });

    for (const [index, plan] of plans.entries()) {
        // A throw here propagates; the write above stays (`DECISIONS.md`).
        if (plan.kind === 'update') {
            await runHook('entry:afterUpdate', {
                type: entryType.id,
                entry: asEntry(plan.record),
                data: params.data,
                user,
            });
        } else {
            await runHook('entry:afterCreate', {
                type: entryType.id,
                data: plan.write,
                user,
                entry: results[index] as Entry,
            });
        }
    }

    return results;
}

/** The row a new translation writes — `create`'s row, for the same hooks. */
type TranslationWrite = EntryCreateContext['data'] & {
    createdBy: string | null;
    updatedBy: string | null;
};

/** What one id in the batch turns out to be: an edit, or a new translation. */
type UpdatePlan =
    | { kind: 'update'; id: string; record: EntryRecord }
    | { kind: 'translate'; id: string; write: TranslationWrite };

/**
 * Updates one entry: validates the patch, versions the state it replaces,
 * writes the row, then re-indexes relationships and propagates shared fields.
 */
async function updateOne(params: {
    repository: EntryRepository;
    entryType: ResolvedEntryType;
    currentEntry: EntryRecord;
    data: EntryUpdateData;
    updatedBy: string | null;
    /** Present when the write targets the staged change rather than the canonical. */
    staging: NonNullable<EntryRepository['staging']> | undefined;
}): Promise<Entry> {
    const { repository, entryType, currentEntry, data, updatedBy, staging } = params;

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
    const slug = await uniqueSlugIfChanged({
        repository,
        type: entryType.id,
        entry: currentEntry,
        slug: validated.slug,
    });

    const ref = { id: currentEntry.id, locale: currentEntry.locale };
    const write = {
        title: validated.title,
        slug,
        fields,
        status: validated.status,
        publishedAt,
        // Moves with `updatedAt`, not with the version snapshot. A publish is a
        // write to the row, so it stamps; whether it also takes a version is
        // `changesVersionedContent`'s separate question.
        updatedBy,
    };

    const entry = asEntry(
        staging ? await staging.update(ref, write) : await repository.update(ref, write)
    );
    if (fields) {
        await indexEntryRelationships(entry, fields, entryType.id);
        // A staged row is not one of the entry's locales, so its shared fields
        // stay with it until the merge.
        if (!staging) {
            await propagateSharedFields({
                repository,
                entryType,
                entry: currentEntry,
                fields,
                patchedFieldNames,
            });
        }
    }
    return entry;
}

/**
 * The row a missing locale gets: the default-locale row's columns with the
 * caller's patch over them, its shared fields inherited, and `create`'s
 * validation applied to the result. Throws when the entry itself is absent.
 */
async function planTranslation(params: {
    repository: EntryRepository;
    entryType: ResolvedEntryType;
    id: string;
    locale: string;
    data: EntryUpdateData;
    user: string | null;
}): Promise<TranslationWrite> {
    const { repository, entryType, id, locale, data, user } = params;
    const source = await getEntryOfType(repository, entryType.id, id);

    const titled = entryType.titleField !== false;
    const validated = parseInput(createEntrySchema({ titled }), {
        title: data.title ?? source.title,
        slug: data.slug ?? source.slug ?? undefined,
        fields: data.fields,
        status: data.status ?? source.status,
        publishedAt: data.publishedAt ?? source.publishedAt,
    });

    const title = validated.title ?? '';
    const status = validated.status ?? 'unpublished';
    const slug = await deriveSlug({
        repository,
        entryType,
        locale,
        title,
        slug: validated.slug,
    });

    const fields = await toStoredFields({
        kind: 'create',
        repository,
        entryType,
        values: validated.fields ?? {},
        locale,
        entryId: id,
        status,
    });

    return {
        title,
        slug,
        locale,
        fields,
        status,
        publishedAt:
            status === 'published' ? new Date() : (validated.publishedAt ?? null),
        createdBy: user,
        updatedBy: user,
    };
}

/** Write the planned translation and fold its edges into the entry's index. */
async function writeTranslation(params: {
    repository: EntryRepository;
    type: string;
    id: string;
    locale: string;
    write: TranslationWrite;
}): Promise<Entry> {
    const { repository, type, id, locale, write } = params;
    const entry = asEntry(await repository.update({ id, locale }, write));
    await indexEntryRelationships(entry, write.fields, type);
    return entry;
}

/** The staged change for one locale, which a staged write requires to exist. */
async function getStagedRecord(
    staging: NonNullable<EntryRepository['staging']>,
    id: string,
    locale: string
): Promise<EntryRecord> {
    const row = await staging.getByCanonical(id, locale);
    if (!row) throw new Error(`No staged change for entry '${id}'`);
    return asRecord(row);
}

/** Root field names the caller actually sent; an `undefined` value is absent. */
function getPatchedFieldNames(patch: Record<string, unknown>): string[] {
    return Object.keys(patch).filter((name) => patch[name] !== undefined);
}
