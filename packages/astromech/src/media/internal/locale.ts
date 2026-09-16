/**
 * The locale a media call addresses. Media opts into translation through
 * `media: { translatable: true }`; without it a file's content lives in the
 * default locale alone.
 */

import type { ResolvedConfig } from '@/types/index';
import { defaultContentLocale } from '@/config/content-locale';
import { MediaValidationError } from '../errors';

/**
 * The locale a call addresses. Non-translatable media lives in the default
 * content locale alone, so any other locale is a caller error rather than a
 * silent write to the wrong row.
 */
export function resolveMediaLocale(config: ResolvedConfig, locale?: string): string {
    const defaultLocale = defaultContentLocale(config);
    const resolved = locale ?? defaultLocale;
    if (resolved !== defaultLocale && !config.media.translatable) {
        throw new MediaValidationError([
            `Media is not translatable, so only the '${defaultLocale}' locale ` +
                `can be written.`,
        ]);
    }
    return resolved;
}
