import type { MediaResource } from '../repository';
import { z } from '@hono/zod-openapi';
import { defaultContentLocale } from '@/config/content-locale';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { defineServiceMethod } from '@/services/define-service-method';
import { mediaRepository } from '../repository';
import { mediaSchema } from '../schema';

/**
 * Read one media item by id, or null when there is no such row. A locale with no
 * content row falls back to the default one, and the returned `locale` names
 * where the content came from.
 */
export const getMedia = defineServiceMethod({
    summary: 'Read one media item by id.',
    input: z.object({ id: z.string(), locale: z.string().optional() }),
    output: mediaSchema.nullable(),
    access: 'media:read',
    mutates: false,
    async handler(params, ctx): Promise<MediaResource | null> {
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.media,
            ctx.config,
            undefined,
            params.locale
        );
        return mediaRepository.findOne(params.id, {
            locale,
            fallbackLocale: defaultContentLocale(ctx.config),
        });
    },
});
