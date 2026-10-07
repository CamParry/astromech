import type { MediaResource } from '../repository';
import type { QueryResult } from '@/types/index';
import { queryPage, queryResultSchema } from '@/content/list';
import { resolveResourceLocale } from '@/content/locale';
import { defineServiceMethod } from '@/services/define-service-method';
import { mediaRepository } from '../repository';
import { mediaSchema, queryMediaSchema } from '../schema';

/**
 * Paginated unless `limit` is `'all'`. The same items are listed whatever the
 * `locale`, which picks only the content row each one is read through.
 */
export const queryMedia = defineServiceMethod({
    summary: 'List media items.',
    input: queryMediaSchema,
    output: queryResultSchema(mediaSchema),
    access: 'media:read',
    mutates: false,
    async handler(params, ctx): Promise<QueryResult<MediaResource>> {
        const { search, where, sort } = params;
        const { config } = ctx;
        const locale = resolveResourceLocale('media', config, undefined, params.locale);

        return queryPage(params, {
            list: (page) =>
                mediaRepository.findMany({ search, where, sort, locale, ...page }),
            count: () => mediaRepository.count({ search, where }),
        });
    },
});
