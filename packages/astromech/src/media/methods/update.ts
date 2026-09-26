import type { MediaResource } from '../repository';
import type { JsonObject, Media } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { propagateSharedFields } from '@/content/translatable';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { patchedFieldNames, writeFields } from '@/content/write-fields';
import { transaction } from '@/database/transaction';
import { ResourceNotFoundError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { syncMediaRelationships } from '../internal/relationships';
import { toMedia } from '../internal/to-media';
import { mediaRepository } from '../repository';
import { updateMediaSchema } from '../schema';

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
        data: updateMediaSchema,
    }),
    access: 'media:update',
    mutates: true,
    idempotent: true,
    async handler(params, ctx): Promise<Media> {
        const { id, data } = params;
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.media,
            ctx.config,
            undefined,
            params.locale
        );

        // The row this write edits or, when the locale has none, the
        // default-locale row the new one is copied from.
        const current = await mediaRepository.findOne(id, { locale });
        const base = current ?? (await mediaRepository.findOne(id));
        if (!base) throw new ResourceNotFoundError('media', { id });

        const config = ctx.config;
        const patch = data.fields;
        const patchedNames = patch === undefined ? [] : patchedFieldNames(patch);

        let fields: JsonObject | undefined;
        if (patch !== undefined) {
            // Merged over `base`, so a locale being written for the first time
            // starts as a copy of the default-locale row.
            fields = await writeFields(
                RESOURCE_SPECS.media,
                config,
                { base: base.fields, patch },
                {
                    operation: 'update',
                    record: toMedia(base),
                    user: ctx.user,
                    scan: () => mediaRepository.findByLocale(locale),
                    excludeId: id,
                }
            );
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
            if (current && changesVersionedContent(RESOURCE_SPECS.media, current, next)) {
                await snapshotVersion(
                    RESOURCE_SPECS.media,
                    mediaRepository.versions,
                    current,
                    ctx.user
                );
            }
            // `updatedAt` is stamped by the repository (the column declares
            // `onUpdate`); an explicitly-`undefined` key means "leave this
            // column alone".
            const row = await mediaRepository.update(
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
                await propagateSharedFields(RESOURCE_SPECS.media, config, {
                    translatable: mediaRepository.translatable,
                    record: { id, locale },
                    fields,
                    patchedFieldNames: patchedNames,
                });
                await syncMediaRelationships(config, id);
            }
            return row;
        });

        return toMedia(updated);
    },
});

/**
 * The value one text column takes. An omitted key is left alone on an edit, and
 * copied from the source row when the locale's row is being created.
 */
function inherited(
    value: string | null | undefined,
    current: MediaResource | null,
    base: MediaResource,
    column: 'title' | 'alt' | 'caption'
): string | null | undefined {
    if (value !== undefined) return value;
    return current ? undefined : base[column];
}
