import type { EntryWithContentId } from './read-entry';
import type {
    AppContext,
    Entry,
    EntryCreateContext,
    ParsedEntryUpdateData,
    ResolvedConfig,
    ResolvedEntryType,
    User,
} from '@/types/index';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { requireStagedChange } from '@/content/staging';
import { propagateSharedFields } from '@/content/translatable';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { patchedFieldNames } from '@/content/write-fields';
import { resolveEntryType } from '@/entries/entry-types';
import { ResourceNotFoundError } from '@/errors/resource';
import { parseInput } from '@/errors/validation';
import { UnknownEntryTypeError } from '../errors';
import { entryRepository } from '../repository/entries-table';
import { createEntrySchema, updateEntrySchema } from '../schema';
import { assertWritableFields } from './entry-type';
import {
    findEntryOfType,
    getEntryOfType,
    toEntry,
    toEntryWithContentId,
} from './read-entry';
import { syncEntryRelationships } from './relationships';
import { deriveSlug, uniqueSlugIfChanged } from './slug';
import { toStoredFields } from './stored-fields';
import { writeBatch } from './write-batch';

/**
 * Updates one locale of a batch of entries, atomically, firing the entry write
 * hooks around it. A single id is a batch of one (`DECISIONS.md`). A locale with
 * no content row yet is created from the default-locale row (unless
 * `createMissingLocale` is false), which is how a translation is written;
 * `staged` writes the staged change instead.
 *
 * Batch-only: `methods/update.ts` and `methods/status.ts` reach it through
 * `fromBatch`, which is what turns one id into a batch of one.
 */
export async function updateEntryBatch(
    params: {
        type: string;
        ids: readonly string[];
        locale?: string | undefined;
        /** Write each entry's staged change for this locale instead of its canonical row. */
        staged?: boolean | undefined;
        /**
         * Write a locale with no content row yet, creating it. Only `update` sets
         * it: a status change addresses a row that must already exist.
         */
        createMissingLocale?: boolean | undefined;
        /** The patch, as `entries.update` parsed it. */
        data: ParsedEntryUpdateData;
    },
    ctx: AppContext
): Promise<Entry[]> {
    const entryType = resolveEntryType(ctx.config, params.type);
    if (!entryType) {
        throw new UnknownEntryTypeError(params.type);
    }

    assertWritableFields(entryType, params.data);

    // A single slug across many ids would violate (type, locale) uniqueness.
    if (params.ids.length > 1 && params.data.slug !== undefined) {
        throw new Error(
            'Bulk update cannot set `slug`: a single value across multiple ids ' +
                'would violate (type, locale) slug uniqueness. Update slugs individually.'
        );
    }

    const locale = resolveResourceLocale(
        RESOURCE_SPECS.entry,
        ctx.config,
        entryType.id,
        params.locale
    );

    const user = ctx.user;
    const staged = params.staged === true;

    // Each id is read once, at the top: the record feeds both the before-hook
    // context and the write, so nothing loads twice. An id with no row in this
    // locale becomes a translation, planned here for the same reason.
    const plans: UpdatePlan[] = [];
    for (const id of params.ids) {
        const record = staged
            ? await getStagedRecord(id, locale)
            : await findEntryOfType(entryType.id, id, locale);
        if (!record && params.createMissingLocale === false) {
            throw new ResourceNotFoundError('entry', { id, locale });
        }
        plans.push(
            record
                ? { kind: 'update', id, record }
                : {
                      kind: 'translate',
                      id,
                      write: await planTranslation({
                          config: ctx.config,
                          entryType,
                          id,
                          locale,
                          data: params.data,
                          user,
                      }),
                  }
        );
    }

    for (const plan of plans) {
        if (plan.kind === 'update') {
            await ctx.runHook('entry:beforeUpdate', {
                type: entryType.id,
                entry: toEntry(plan.record),
                data: params.data,
                user,
            });
        } else {
            await ctx.runHook('entry:beforeCreate', {
                type: entryType.id,
                data: plan.write,
                user,
            });
        }
    }

    const results = await writeBatch(plans, (plan) =>
        plan.kind === 'update'
            ? updateOne({
                  config: ctx.config,
                  entryType,
                  currentEntry: plan.record,
                  data: params.data,
                  user,
                  staged,
              })
            : writeTranslation({
                  config: ctx.config,
                  type: entryType.id,
                  id: plan.id,
                  locale,
                  write: plan.write,
              })
    );

    for (const [index, plan] of plans.entries()) {
        // A throw here propagates; the write above stays (`DECISIONS.md`).
        if (plan.kind === 'update') {
            await ctx.runHook('entry:afterUpdate', {
                type: entryType.id,
                entry: toEntry(plan.record),
                data: params.data,
                user,
            });
        } else {
            await ctx.runHook('entry:afterCreate', {
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
    | { kind: 'update'; id: string; record: EntryWithContentId }
    | { kind: 'translate'; id: string; write: TranslationWrite };

/**
 * Updates one entry: validates the patch, versions the state it replaces,
 * writes the row, then re-indexes relationships and propagates shared fields.
 */
async function updateOne(params: {
    config: ResolvedConfig;
    entryType: ResolvedEntryType;
    currentEntry: EntryWithContentId;
    data: ParsedEntryUpdateData;
    user: User | null;
    /** True when the write targets the staged change rather than the canonical. */
    staged: boolean;
}): Promise<Entry> {
    const { config, entryType, currentEntry, data, user, staged } = params;

    const titled = entryType.titleField !== false;
    const validated = parseInput(updateEntrySchema({ titled }), data);

    const patch = validated.fields;
    const patched = patch ? patchedFieldNames(patch) : [];
    const fields = patch
        ? await toStoredFields({
              kind: 'update',
              config,
              entryType,
              currentEntry,
              patch,
              status: validated.status,
              user,
          })
        : undefined;

    // Snapshot before the slug is uniquified, so the version compares what the caller sent.
    if (
        entryType.capabilities.versioning &&
        changesVersionedContent(RESOURCE_SPECS.entry, currentEntry, {
            title: validated.title,
            slug: validated.slug,
            fields,
        })
    ) {
        await snapshotVersion(
            RESOURCE_SPECS.entry,
            entryRepository.versions,
            currentEntry,
            user
        );
    }

    const publishedAt =
        validated.status === 'published' && !currentEntry.publishedAt
            ? new Date()
            : validated.publishedAt;
    const slug = await uniqueSlugIfChanged({
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
        updatedBy: user?.id ?? null,
    };

    const entry = toEntry(
        staged
            ? await entryRepository.staging.update(ref, write)
            : await entryRepository.update(ref, write)
    );
    if (fields) {
        await syncEntryRelationships(config, entry, entryType.id);
        // A staged row is not one of the entry's locales, so its shared fields
        // stay with it until the merge.
        if (!staged) {
            await propagateSharedFields(RESOURCE_SPECS.entry, config, {
                target: entryType.id,
                translatable: entryRepository.translatable,
                record: currentEntry,
                fields,
                patchedFieldNames: patched,
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
    config: ResolvedConfig;
    entryType: ResolvedEntryType;
    id: string;
    locale: string;
    data: ParsedEntryUpdateData;
    user: User | null;
}): Promise<TranslationWrite> {
    const { config, entryType, id, locale, data, user } = params;
    const source = await getEntryOfType(entryType.id, id);

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
        entryType,
        locale,
        title,
        slug: validated.slug,
    });

    const fields = await toStoredFields({
        kind: 'create',
        config,
        entryType,
        values: validated.fields ?? {},
        locale,
        entryId: id,
        status,
        user,
    });

    return {
        title,
        slug,
        locale,
        fields,
        status,
        publishedAt:
            status === 'published' ? new Date() : (validated.publishedAt ?? null),
        createdBy: user?.id ?? null,
        updatedBy: user?.id ?? null,
    };
}

/** Write the planned translation and fold its references into the entry's index. */
async function writeTranslation(params: {
    config: ResolvedConfig;
    type: string;
    id: string;
    locale: string;
    write: TranslationWrite;
}): Promise<Entry> {
    const { config, type, id, locale, write } = params;
    const entry = toEntry(await entryRepository.update({ id, locale }, write));
    await syncEntryRelationships(config, entry, type);
    return entry;
}

/** The staged change for one locale, which a staged write requires to exist. */
async function getStagedRecord(id: string, locale: string): Promise<EntryWithContentId> {
    return toEntryWithContentId(
        await requireStagedChange(entryRepository.staging, 'entry', {
            rowId: id,
            id,
            locale,
        })
    );
}
