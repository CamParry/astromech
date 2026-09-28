import type { EntryResource } from '../repository/types';
import type { EntryDuplicateOverrides } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { resolvePublishedAt } from '@/content/published-at';
import { transaction } from '@/database/transaction';
import { defineServiceMethod } from '@/services/define-service-method';
import { entryAccess } from '../internal/access';
import { getEntryOfType, getEntryResource } from '../read-entry';
import { syncEntryRelationships } from '../relationships';
import { entryRepository } from '../repository/entries-table';
import { duplicateOverridesSchema, entrySchema } from '../schema';

/**
 * Copies every locale, or only `overrides.locale`, into a new entry of the same
 * type, `unpublished` unless `overrides` says otherwise. Each slug is made unique
 * in its locale. No entry hooks fire.
 */
export const duplicateEntry = defineServiceMethod({
    summary: 'Copy an entry into a new one.',
    input: duplicateEntryInput({ type: z.string() }),
    output: entrySchema,
    access: entryAccess('create'),
    mutates: true,
    async handler(params, ctx): Promise<EntryResource> {
        const { type, id, overrides } = params;
        const { config, user } = ctx;
        const userId = user?.id ?? null;

        const source = overrides?.locale
            ? await getEntryOfType(type, id, overrides.locale)
            : await getEntryResource(type, id);
        const locales = overrides?.locale ? [overrides.locale] : source.locales;
        const [firstLocale = source.locale, ...restLocales] = locales;

        return transaction(async () => {
            const first = await copyLocale({
                type,
                id,
                source,
                locale: firstLocale,
                overrides,
                createdBy: userId,
            });
            for (const locale of restLocales) {
                await copyLocale({
                    type,
                    id,
                    source,
                    locale,
                    overrides,
                    createdBy: userId,
                    into: first.id,
                });
            }
            // Once, at the end: the index is per entry and reads every locale back.
            await syncEntryRelationships(config, first, type);
            // Re-read so `locales` names every copied locale, not just the first.
            return getEntryOfType(type, first.id, firstLocale);
        });
    },
});

/**
 * `entries.duplicate`'s input, with `type` as given: any type id on the method,
 * one type's literal in that type's catalogue.
 */
export function duplicateEntryInput<T extends z.ZodType>({ type }: { type: T }) {
    return z.strictObject({
        type,
        id: z.string(),
        overrides: duplicateOverridesSchema.optional(),
    });
}

/**
 * Copies one locale of the source into the new entry, creating the entry when
 * `into` is absent. The slug is made unique in the locale it lands in.
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
        // A copy is a new row, so it has no date of its own to keep.
        publishedAt: resolvePublishedAt({
            status,
            given: undefined,
            current: null,
            now: new Date(),
        }),
        createdBy,
        updatedBy: createdBy,
    };

    return into === undefined
        ? entryRepository.create({ type, ...write })
        : entryRepository.update({ id: into, locale }, write);
}
