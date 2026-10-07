import type { UserResource } from '../repository';
import type { QueryResult } from '@/types/index';
import { queryPage, queryResultSchema } from '@/content/list';
import { resolveResourceLocale } from '@/content/locale';
import { defineServiceMethod } from '@/services/define-service-method';
import { userRepository } from '../repository';
import { queryUsersSchema, userSchema } from '../schema';

/**
 * Paginated unless `limit` is `'all'`. The same users are listed whatever the
 * `locale`, which picks only the content row each one is read through.
 */
export const queryUsers = defineServiceMethod({
    summary: 'List CMS users.',
    input: queryUsersSchema,
    output: queryResultSchema(userSchema),
    access: 'users:read',
    mutates: false,
    async handler(params, ctx): Promise<QueryResult<UserResource>> {
        const { search, sort } = params;
        const { config } = ctx;
        const locale = resolveResourceLocale('user', config, undefined, params.locale);

        return queryPage(params, {
            list: (page) => userRepository.findMany({ search, sort, locale, ...page }),
            count: () => userRepository.count({ search }),
        });
    },
});
