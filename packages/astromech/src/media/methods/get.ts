import type { Media } from '@/types/index';
import { z } from '@hono/zod-openapi';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { defineServiceMethod } from '@/services/define-service-method';
import { findMedia } from '../internal/find-media';
import { toMedia } from '../internal/to-media';
import { createMediaRepository } from '../repository';

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
        const row = await findMedia(createMediaRepository(ctx.config), params.id, locale);
        return row ? toMedia(ctx.config, row) : null;
    },
});
