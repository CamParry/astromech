/**
 * Reading one media item, with the fallback a media read promises: the asked
 * locale, then the default locale. The returned row's `locale` names where the
 * content came from.
 */

import type { MediaRepository, MediaRow } from '../repository';

/** One media item, read through the locale fallback chain. */
export async function readMedia(
    repository: MediaRepository,
    id: string,
    locale?: string
): Promise<MediaRow | null> {
    return (await repository.get(id, locale)) ?? (await repository.get(id));
}
