import type { QueryResult, User } from '@/types/index';
import { queryPage } from '@/content/list';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { defineServiceMethod } from '@/services/define-service-method';
import { toUser } from '../internal/to-user';
import { userRepository } from '../repository';
import { userQuerySchema } from '../schema';

/**
 * List CMS users, paginated unless `limit: 'all'` asks for the lot. The page is
 * the same either way — every user is listed through their default-locale row —
 * and `locale` only decides which content row each one is read through.
 */
export const queryUsers = defineServiceMethod({
    summary: 'List CMS users.',
    input: userQuerySchema,
    access: 'users:read',
    mutates: false,
    async handler(params, ctx): Promise<QueryResult<User>> {
        const locale = resolveResourceLocale(
            RESOURCE_SPECS.user,
            ctx.config,
            undefined,
            params.locale
        );
        const { search, sort } = params;
        const result = await queryPage(params, {
            list: (page) => userRepository.findMany({ search, sort, locale, ...page }),
            count: () => userRepository.count({ search }),
        });
        return { ...result, data: result.data.map(toUser) };
    },
});
