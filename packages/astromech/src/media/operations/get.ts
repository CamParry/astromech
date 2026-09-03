import type { Media } from '@/types/index';
import { mediaRepository, resolveMediaLocale } from '../internal/locale';
import { toMedia } from '../internal/to-media';

/**
 * Read one media item by id, or null when there is no such row. A locale with no
 * content row falls back to the default one, and the returned `locale` names
 * where the content came from.
 */
export async function getMedia(params: {
    id: string;
    locale?: string;
}): Promise<Media | null> {
    const locale = resolveMediaLocale(params.locale);
    const row = await mediaRepository().get(params.id, locale);
    return row ? toMedia(row) : null;
}
