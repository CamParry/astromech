import type { QueryResult, User, UserQueryParams } from '@/types/index';
import { defineServiceMethod } from '@/services/define-service-method';
import { resolveUserLocale, userRepository } from '../internal/locale';
import { toUser } from '../internal/to-user';
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
    async handler(params: UserQueryParams | undefined): Promise<QueryResult<User>> {
        const locale = resolveUserLocale(params?.locale);
        const repository = userRepository();
        const page = params?.page ?? 1;
        const limit = params?.limit;

        if (limit === 'all') {
            const rows = await repository.list(
                { search: params?.search, sort: params?.sort },
                locale
            );
            return { data: rows.map(toUser), pagination: null };
        }

        const perPage = typeof limit === 'number' ? limit : 20;
        const offset = (page - 1) * perPage;

        const [rows, total] = await Promise.all([
            repository.list(
                {
                    search: params?.search,
                    sort: params?.sort,
                    limit: perPage,
                    offset,
                },
                locale
            ),
            repository.count({ search: params?.search }),
        ]);

        return {
            data: rows.map(toUser),
            pagination: {
                page,
                limit: perPage,
                total,
                pages: Math.ceil(total / perPage),
            },
        };
    },
});
