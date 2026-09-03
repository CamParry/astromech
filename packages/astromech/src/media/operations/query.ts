import type { Media, MediaQueryParams, QueryResult } from '@/types/index';
import { mediaRepository, resolveMediaLocale } from '../internal/locale';
import { toMedia } from '../internal/to-media';

/**
 * List media items, paginated unless `limit: 'all'` asks for the lot. The page
 * is the same either way — every item has a default-locale row — and `locale`
 * only decides which content row each item is read through.
 */
export async function queryMedia(
    params?: MediaQueryParams & { locale?: string }
): Promise<QueryResult<Media>> {
    const locale = resolveMediaLocale(params?.locale);
    const repository = mediaRepository();
    const page = params?.page ?? 1;
    const limit = params?.limit;

    if (limit === 'all') {
        const rows = await repository.list(params, undefined, locale);
        return { data: rows.map(toMedia), pagination: null };
    }

    const perPage = typeof limit === 'number' ? limit : 20;
    const offset = (page - 1) * perPage;

    const [rows, total] = await Promise.all([
        repository.list(params, { limit: perPage, offset }, locale),
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
