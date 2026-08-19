import type { Media, MediaQueryParams, QueryResult } from '@/types/index';
import { toMedia } from '../internal/to-media';
import { createMediaRepository } from '../repository';

/** List media items, paginated unless `limit: 'all'` asks for the lot. */
export async function query(params?: MediaQueryParams): Promise<QueryResult<Media>> {
    const repository = createMediaRepository();
    const page = params?.page ?? 1;
    const limit = params?.limit;

    if (limit === 'all') {
        const rows = await repository.list(params);
        return { data: rows.map(toMedia), pagination: null };
    }

    const perPage = typeof limit === 'number' ? limit : 20;
    const offset = (page - 1) * perPage;

    const [rows, total] = await Promise.all([
        repository.list(params, { limit: perPage, offset }),
        repository.count(params),
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
