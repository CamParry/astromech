import type { QueryResult, User, UserQueryParams } from '@/types/index';
import { toUser } from '../internal/to-user';
import { createUserStorage } from '../storage';

/** List CMS users, paginated unless `limit: 'all'` asks for the lot. */
export async function query(params?: UserQueryParams): Promise<QueryResult<User>> {
    const storage = createUserStorage();
    const page = params?.page ?? 1;
    const limit = params?.limit;

    if (limit === 'all') {
        const rows = await storage.list({
            search: params?.search,
            sort: params?.sort,
        });
        return { data: rows.map(toUser), pagination: null };
    }

    const perPage = typeof limit === 'number' ? limit : 20;
    const offset = (page - 1) * perPage;

    const [rows, total] = await Promise.all([
        storage.list({
            search: params?.search,
            sort: params?.sort,
            limit: perPage,
            offset,
        }),
        storage.count({ search: params?.search }),
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
}
