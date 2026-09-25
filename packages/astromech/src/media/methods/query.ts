import type { Media, QueryResult } from '@/types/index';
import { queryPage } from '@/content/list';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { defineServiceMethod } from '@/services/define-service-method';
import { toMedia } from '../internal/to-media';
import { mediaRepository } from '../repository';
import { mediaQuerySchema } from '../schema';

/**
 * List media items, paginated unless `limit: 'all'` asks for the lot. The page
 * is the same either way — every item has a default-locale row — and `locale`
 * only decides which content row each item is read through.
 */
export const queryMedia = defineServiceMethod({
    summary: 'List media items.',
    input: mediaQuerySchema,
    access: 'media:read',
    mutates: false,
    async handler(params, ctx): Promise<QueryResult<Media>> {
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.media,
            ctx.config,
            undefined,
            params.locale
        );
        const { search, where, sort } = params;
        const result = await queryPage(params, {
            list: (page) =>
                mediaRepository.findMany({ search, where, sort, locale, ...page }),
            count: () => mediaRepository.count({ search, where }),
        });
        return { ...result, data: result.data.map((row) => toMedia(ctx.config, row)) };
    },
});
