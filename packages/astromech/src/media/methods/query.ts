import type { MediaResource } from '../repository';
import type { QueryResult } from '@/types/index';
import { queryPage, queryResultSchema } from '@/content/list';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { defineServiceMethod } from '@/services/define-service-method';
import { mediaRepository } from '../repository';
import { mediaQuerySchema, mediaSchema } from '../schema';

/**
 * List media items, paginated unless `limit: 'all'` asks for the lot. The page
 * is the same either way — every item has a default-locale row — and `locale`
 * only decides which content row each item is read through.
 */
export const queryMedia = defineServiceMethod({
    summary: 'List media items.',
    input: mediaQuerySchema,
    output: queryResultSchema(mediaSchema),
    access: 'media:read',
    mutates: false,
    async handler(params, ctx): Promise<QueryResult<MediaResource>> {
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.media,
            ctx.config,
            undefined,
            params.locale
        );
        const { search, where, sort } = params;
        return queryPage(params, {
            list: (page) =>
                mediaRepository.findMany({ search, where, sort, locale, ...page }),
            count: () => mediaRepository.count({ search, where }),
        });
    },
});
