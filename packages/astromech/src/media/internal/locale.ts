/**
 * The locale a media call addresses, and the repository bound to the configured
 * default content locale. Media opts into translation through
 * `media: { translatable: true }`; without it a file's content lives in the
 * default locale alone.
 */

import type { MediaRepository } from '../repository';
import { getDefaultContentLocale } from '@/config/content-locale';
import { getConfig } from '@/config/registry';
import { MediaValidationError } from '../errors';
import { createMediaRepository } from '../repository';

/**
 * The locale a call addresses. Non-translatable media lives in the default
 * content locale alone, so any other locale is a caller error rather than a
 * silent write to the wrong row.
 */
export function resolveMediaLocale(locale?: string): string {
    const defaultLocale = getDefaultContentLocale();
    const resolved = locale ?? defaultLocale;
    if (resolved !== defaultLocale && !getConfig().media.translatable) {
        throw new MediaValidationError([
            `Media is not translatable, so only the '${defaultLocale}' locale ` +
                `can be written.`,
        ]);
    }
    return resolved;
}

/** The media repository, bound to the configured default content locale. */
export function mediaRepository(): MediaRepository {
    return createMediaRepository({ defaultLocale: getDefaultContentLocale() });
}
