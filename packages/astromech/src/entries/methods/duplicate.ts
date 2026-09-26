import type { EntryResource } from '../repository/types';
import type { EntryDuplicateOverrides } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryGate } from '../internal/access';
import { getEntryOfType, getEntryResource } from '../internal/read-entry';
import { syncEntryRelationships } from '../internal/relationships';
import { entryRepository } from '../repository/entries-table';
import { duplicateOverridesSchema, entrySchema } from '../schema';

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
    output: entrySchema,
    access: entryGate('create'),
    mutates: true,
    async handler(params, ctx): Promise<EntryResource> {
        const { type, id, overrides } = params;

        const source = overrides?.locale
            ? await getEntryOfType(type, id, overrides.locale)
            : await getEntryResource(type, id);
        // The copy is a new entry made by whoever duplicated it, not by the author
        // of the source.
        const user = ctx.user;

        const locales = overrides?.locale ? [overrides.locale] : source.locales;
        const [firstLocale = source.locale, ...restLocales] = locales;

        // Write the entry and its relationship index atomically.
        const created = await transaction(async () => {
            const first = await copyLocale({
                type,
                id,
                source,
                locale: firstLocale,
                overrides,
                createdBy: user?.id ?? null,
            });

            for (const locale of restLocales) {
                await copyLocale({
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
            await syncEntryRelationships(ctx.config, first, type);
            // Re-read so `locales` names every copied locale, not just the first.
            return getEntryOfType(type, first.id, firstLocale);
        });

        return created;
    },
});

/**
 * Copy one locale of the source into the new entry, minting it when `into` is
 * absent. The slug is re-uniqued within the locale it lands in.
 */
async function copyLocale(params: {
    type: string;
    id: string;
    source: EntryResource;
    locale: string;
    overrides: EntryDuplicateOverrides | undefined;
    createdBy: string | null;
    into?: string;
}): Promise<EntryResource> {
    const { type, id, source, locale, overrides, createdBy, into } = params;

    const row =
        locale === source.locale ? source : await getEntryOfType(type, id, locale);

    const status = overrides?.status ?? 'unpublished';
    const baseSlug = overrides?.slug ?? row.slug;
    const write = {
        title: overrides?.title ?? row.title,
        slug: baseSlug ? await entryRepository.uniqueSlug(type, locale, baseSlug) : null,
        locale,
        fields: { ...(row.fields ?? {}), ...(overrides?.fields ?? {}) },
        status,
        publishedAt: status === 'published' ? new Date() : null,
        createdBy,
        updatedBy: createdBy,
    };

    return into === undefined
        ? entryRepository.create({ type, ...write })
        : entryRepository.update({ id: into, locale }, write);
}
