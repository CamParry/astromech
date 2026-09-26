/** The content row a media item's version methods address. */

import type { MediaResource } from '../repository';
import type { ResolvedConfig } from '@/types/index';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { ResourceNotFoundError } from '@/errors/resource';
import { mediaRepository } from '../repository';

/**
 * The media item in the locale a version method addresses. Unlike a read, this does
 * not fall back to the default locale: a locale with no content row throws.
 */
export async function getMediaInLocale(
    config: ResolvedConfig,
    params: { id: string; locale?: string | undefined }
): Promise<MediaResource> {
    const locale = resolveResourceLocale(
        RESOURCE_SPECS.media,
        config,
        undefined,
        params.locale
    );
    const current = await mediaRepository.findOne(params.id, { locale });
    if (!current) throw new ResourceNotFoundError('media', { id: params.id, locale });
    return current;
}
