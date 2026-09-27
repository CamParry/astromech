import type { MediaResource } from '../repository';
import { z } from '@hono/zod-openapi';
import { resolveResourceLocale } from '@/content/locale';
import { patchedFieldNames, prepareFields } from '@/content/prepare-fields';
import { propagateSharedFields } from '@/content/translatable';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';
import { transaction } from '@/database/transaction';
import { ResourceNotFoundError } from '@/errors/resource';
import { defineServiceMethod } from '@/services/define-service-method';
import { syncMediaRelationships } from '../relationships';
import { mediaRepository } from '../repository';
import { mediaSchema, updateMediaSchema } from '../schema';

/**
 * Writes one locale's content row. A locale with none is seeded from the default
 * locale's, with the patch applied over it.
 */
export const updateMedia = defineServiceMethod({
    summary:
        'Update a media item’s metadata. Fields merge: omitted fields keep ' +
        'their current value, and arrays are replaced whole.',
    input: z.strictObject({
        id: z.string(),
        locale: z.string().optional(),
        data: updateMediaSchema,
    }),
    output: mediaSchema,
    access: 'media:update',
    mutates: true,
    idempotent: true,
    async handler(params, ctx): Promise<MediaResource> {
        const { id, data } = params;
        const { title, alt, caption, fields: patch } = data;
        const { config, user } = ctx;
        const userId = user?.id ?? null;
        const locale = resolveResourceLocale('media', config, undefined, params.locale);

        // With no content row in `locale`, `base` is the row the new one is seeded from.
        const current = await mediaRepository.findOne(id, { locale });
        const base = current ?? (await mediaRepository.findOne(id));
        if (!base) throw new ResourceNotFoundError('media', { id });

        const fields =
            patch === undefined
                ? undefined
                : await prepareFields({
                      resource: 'media',
                      config,
                      operation: 'update',
                      existing: base,
                      user,
                      scan: () => mediaRepository.findByLocale(locale),
                      excludeId: id,
                      base: base.fields,
                      patch,
                  });
        const patchedNames = patch === undefined ? [] : patchedFieldNames(patch);
        const next = {
            title: inherited(title, current, base, 'title'),
            alt: inherited(alt, current, base, 'alt'),
            caption: inherited(caption, current, base, 'caption'),
            fields: inherited(fields, current, base, 'fields'),
        };

        return transaction(async () => {
            if (current && changesVersionedContent('media', current, next)) {
                await snapshotVersion('media', mediaRepository.versions, current, user);
            }
            const updated = await mediaRepository.update(
                { id, locale },
                {
                    ...next,
                    updatedBy: userId,
                    ...(current ? {} : { createdBy: userId }),
                }
            );
            if (fields !== undefined) {
                await propagateSharedFields('media', config, {
                    translatable: mediaRepository.translatable,
                    record: { id, locale },
                    fields,
                    patchedFieldNames: patchedNames,
                });
                await syncMediaRelationships(config, id);
            }
            return updated;
        });
    },
});

/**
 * The value one column is written with. An omitted key leaves the column alone
 * on an edit, and is copied from `base` when the locale's row is being created.
 */
function inherited<K extends 'title' | 'alt' | 'caption' | 'fields'>(
    value: MediaResource[K] | undefined,
    current: MediaResource | null,
    base: MediaResource,
    column: K
): MediaResource[K] | undefined {
    if (value !== undefined) return value;
    return current ? undefined : base[column];
}
