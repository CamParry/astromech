import type { Media } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { defaultContentLocale } from '@/config/content-locale';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { defineServiceMethod } from '@/services/define-service-method';
import { toMedia } from '../internal/to-media';
import { mediaRepository } from '../repository';

/**
 * Read one media item by id, or null when there is no such row. A locale with no
 * content row falls back to the default one, and the returned `locale` names
 * where the content came from.
 */
export const getMedia = defineServiceMethod({
    summary: 'Read one media item by id.',
    input: z.object({ id: z.string(), locale: z.string().optional() }),
    access: 'media:read',
    mutates: false,
    async handler(params, ctx): Promise<Media | null> {
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.media,
            ctx.config,
            undefined,
            params.locale
        );
        const row = await mediaRepository.findOne(params.id, {
            locale,
            fallbackLocale: defaultContentLocale(ctx.config),
        });
        return row ? toMedia(row) : null;
    },
});
