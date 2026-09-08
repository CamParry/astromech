import type { MediaRow } from '../repository';
import type { JsonObject, Media, MediaUpdateData } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { propagateSharedFields } from '@/content/translatable';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { pruneDanglingRelations } from '@/entries/internal/dangling-relations';
import { flattenFieldNodes } from '@/fields/flatten';
import { parseFields } from '@/fields/parse-fields';
import { mergePatch, projectToSchema } from '@/fields/values';
import { defineServiceMethod } from '@/services/define-service-method';
import { MediaNotFoundError } from '../errors';
import { mediaRepository, resolveMediaLocale } from '../internal/locale';
import { createMediaLookups } from '../internal/lookups';
import { indexMediaRelationships } from '../internal/relationships';
import { toMedia } from '../internal/to-media';
import { updateMediaSchema } from '../schema';

/** The content columns a version snapshots, so a change to one is versioned. */
const VERSIONED_COLUMNS = ['title', 'alt', 'caption'] as const;

/**
 * The `data` slot, declared as what it describes rather than inferred.
 * `updateMediaSchema`'s optional keys widen to `| undefined`, which
 * `exactOptionalPropertyTypes` keeps distinct from `MediaUpdateData`'s
 * `title?: string | null`. `ParsedInput` reconciles that at the top level of an
 * argument object; it does not reach inside one, and the same schema object is
 * what parses the call.
 */
const updateData = updateMediaSchema as unknown as z.ZodType<MediaUpdateData>;

/**
 * Update one locale of a media item's authored content. A locale with no row yet
 * gets one seeded from the default-locale row with the patch applied over it, so
 * a read does not change shape when the translation is created.
 */
export const updateMedia = defineServiceMethod({
    summary:
        'Update a media item’s metadata. Fields merge: omitted fields keep ' +
        'their current value, and arrays are replaced whole.',
    input: z.object({
        id: z.string(),
        locale: z.string().optional(),
        data: updateData,
    }),
    access: 'media:update',
    mutates: true,
    idempotent: true,
    async handler(
        params: { id: string; locale?: string; data: MediaUpdateData },
        ctx
    ): Promise<Media> {
        const { id, data } = params;
        const locale = resolveMediaLocale(ctx.config, params.locale);
        const repository = mediaRepository(ctx.config);

        // The row this write edits, or — when the locale has none — the
        // default-locale row the new one is copied from.
        const current = await repository.getExact(id, locale);
        const base = current ?? (await repository.get(id));
        if (!base) throw new MediaNotFoundError({ id });

        const config = ctx.config;
        const definitions = flattenFieldNodes(config.media.fields ?? []);

        const patch = data.fields as Record<string, unknown> | undefined;
        const patchedNames =
            patch === undefined
                ? []
                : Object.keys(patch).filter((name) => patch[name] !== undefined);

        let fields: JsonObject | undefined;
        if (patch !== undefined) {
            // `fields` is a patch: an omitted field keeps its stored value, an
            // explicit `null` stores null, and a container replaces wholesale.
            const merged = mergePatch(base.fields, patch);
            const parsed = await parseFields(merged, definitions, {
                operation: 'update',
                resource: { kind: 'media', record: toMedia(config, base) },
                user: ctx.user,
                lookups: createMediaLookups(repository, { locale, excludeId: id }),
                coerceOnly: new Set(patchedNames),
                ...(config.media.validate ? { validate: config.media.validate } : {}),
            });
            // After `parseFields` (its minted item ids are what the traversal
            // needs) and before the write, so the index derives from the pruned
            // values.
            const pruned = await pruneDanglingRelations(
                config,
                definitions,
                projectToSchema(parsed, definitions) as JsonObject
            );
            fields = pruned.values;
        } else if (!current) {
            // The copy carries the source row's fields unchanged.
            fields = base.fields;
        }

        const next = {
            title: inherited(data.title, current, base, 'title'),
            alt: inherited(data.alt, current, base, 'alt'),
            caption: inherited(data.caption, current, base, 'caption'),
            fields,
        };

        const userId = ctx.user?.id ?? null;

        // The version, the row write and the index write are one transaction: an
        // index that outlived a failed write would name relations the stored
        // fields do not.
        const updated = await transaction(async () => {
            if (current && changesVersionedContent(current, next, VERSIONED_COLUMNS)) {
                await snapshotVersion(repository.versions, current, ctx.user, {
                    title: current.title,
                    alt: current.alt,
                    caption: current.caption,
                });
            }
            // `updatedAt` is stamped by the repository (the column declares
            // `onUpdate`); an explicitly-`undefined` key means "leave this
            // column alone".
            const row = await repository.update(
                { id, locale },
                {
                    ...next,
                    updatedBy: userId,
                    // A locale being written for the first time is authored now,
                    // whoever uploaded the file.
                    ...(current ? {} : { createdBy: userId }),
                }
            );
            // An update that never touched `fields` must leave the index and the
            // item's other locales alone.
            if (fields !== undefined && patch !== undefined) {
                await propagateSharedFields({
                    translatable: repository.translatable,
                    definitions,
                    isTranslatable: config.media.translatable,
                    record: { id, locale },
                    fields,
                    patchedFieldNames: patchedNames,
                });
                await indexMediaRelationships(config, id);
            }
            return row;
        });

        return toMedia(config, updated);
    },
});

/**
 * The value one text column takes. An omitted key is left alone on an edit, and
 * copied from the source row when the locale's row is being created.
 */
function inherited(
    value: string | null | undefined,
    current: MediaRow | null,
    base: MediaRow,
    column: 'title' | 'alt' | 'caption'
): string | null | undefined {
    if (value !== undefined) return value;
    return current ? undefined : base[column];
}
