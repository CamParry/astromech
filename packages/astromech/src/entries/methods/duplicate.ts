import type { EntryRecord } from '../internal/records';
import type { EntryRepository } from '../repository/types';
import type {
    Entry,
    EntryDuplicateOverrides,
    JsonObject,
    ResolvedConfig,
} from '@/types/index';
import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { asEntry, getEntryOfType, getEntryResource } from '../internal/records';
import { syncEntryRelationships } from '../internal/relationships';
import { getEntryRepository } from '../repository/registry';
import { duplicateOverridesSchema } from '../schema';

/**
 * Duplicates an entry: copies every locale of it into a new entry of the same
 * type, applying any overrides, and indexes the copy's relationships.
 * `overrides.locale` copies that locale alone. Throws if the source does not
 * exist or is the wrong type.
 */
export const duplicateEntry = defineServiceMethod({
    summary: 'Copy an entry into a new one.',
    input: z.object({
        type: z.string(),
        id: z.string(),
        overrides: duplicateOverridesSchema.optional(),
    }),
    access: entryGate('create'),
    mutates: true,
    async handler(params, ctx): Promise<Entry> {
        const { type, id, overrides } = params;

        const repository = getEntryRepository(type);
        const source = overrides?.locale
            ? await getEntryOfType(ctx.config, repository, type, id, overrides.locale)
            : await getEntryResource(ctx.config, repository, type, id);
        // The copy is a new entry made by whoever duplicated it, not by the author
        // of the source.
        const user = ctx.user;

        const locales = overrides?.locale ? [overrides.locale] : source.locales;
        const [firstLocale = source.locale, ...restLocales] = locales;

        // Write the entry and its relationship index atomically.
        const created = await transaction(async () => {
            const first = await copyLocale({
                config: ctx.config,
                repository,
                type,
                id,
                source,
                locale: firstLocale,
                overrides,
                createdBy: user?.id ?? null,
            });

            for (const locale of restLocales) {
                await copyLocale({
                    config: ctx.config,
                    repository,
                    type,
                    id,
                    source,
                    locale,
                    overrides,
                    createdBy: user?.id ?? null,
                    into: first.id,
                });
            }

            // Once, at the end: the index is per entry and reads every locale back.
            await syncEntryRelationships(ctx.config, first, first.fields, type);
            // Re-read so `locales` names every copied locale, not just the first.
            return asEntry(
                await getEntryOfType(ctx.config, repository, type, first.id, firstLocale)
            );
        });

        return created;
    },
});

/**
 * Copy one locale of the source into the new entry, minting it when `into` is
 * absent. The slug is re-uniqued within the locale it lands in.
 */
async function copyLocale(params: {
    config: ResolvedConfig;
    repository: EntryRepository;
    type: string;
    id: string;
    source: EntryRecord;
    locale: string;
    overrides: EntryDuplicateOverrides | undefined;
    createdBy: string | null;
    into?: string;
}): Promise<Entry> {
    const { config, repository, type, id, source, locale, overrides, createdBy, into } =
        params;

    const row =
        locale === source.locale
            ? source
            : await getEntryOfType(config, repository, type, id, locale);

    const status = overrides?.status ?? 'unpublished';
    const baseSlug = overrides?.slug ?? row.slug;
    const write = {
        title: overrides?.title ?? row.title,
        slug: baseSlug ? await repository.uniqueSlug(type, locale, baseSlug) : null,
        locale,
        fields: { ...(row.fields ?? {}), ...(overrides?.fields ?? {}) } as JsonObject,
        status,
        publishedAt: status === 'published' ? new Date() : null,
        createdBy,
        updatedBy: createdBy,
    };

    return asEntry(
        into === undefined
            ? await repository.create({ type, ...write })
            : await repository.update({ id: into, locale }, write)
    );
}
