import type { Media, MediaQueryParams, QueryResult } from '@/types/index';
import { toMedia } from '../internal/to-media';
import { createMediaStorage } from '../storage';

/** List media items, paginated unless `limit: 'all'` asks for the lot. */
export async function query(params?: MediaQueryParams): Promise<QueryResult<Media>> {
    const storage = createMediaStorage();
    const page = params?.page ?? 1;
    const limit = params?.limit;

    if (limit === 'all') {
        const rows = await storage.list(params);
        return { data: rows.map(toMedia), pagination: null };
    }

    const perPage = typeof limit === 'number' ? limit : 20;
    const offset = (page - 1) * perPage;

    const [rows, total] = await Promise.all([
        storage.list(params, { limit: perPage, offset }),
        storage.count(params),
    ]);

    return {
        data: rows.map(toMedia),
        pagination: {
            page,
            limit: perPage,
            total,
            pages: Math.ceil(total / perPage),
        },
    };
}
