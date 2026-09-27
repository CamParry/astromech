import type { MediaResource } from '../repository';
import { z } from '@hono/zod-openapi';
import { defaultContentLocale } from '@/config/content-locale';
import { resolveResourceLocale } from '@/content/locale';
import { defineServiceMethod } from '@/services/define-service-method';
import { mediaRepository } from '../repository';
import { mediaSchema } from '../schema';

/**
 * A missing item answers null. A locale with no content row falls back to the
 * default locale; the result's `locale` names the one read.
 */
export const getMedia = defineServiceMethod({
    summary: 'Read one media item by id.',
    input: z.strictObject({ id: z.string(), locale: z.string().optional() }),
    output: mediaSchema.nullable(),
    access: 'media:read',
    mutates: false,
    async handler(params, ctx): Promise<MediaResource | null> {
        const { id } = params;
        const { config } = ctx;
        const locale = resolveResourceLocale('media', config, undefined, params.locale);
        const fallbackLocale = defaultContentLocale(config);

        return mediaRepository.findOne(id, { locale, fallbackLocale });
    },
});
