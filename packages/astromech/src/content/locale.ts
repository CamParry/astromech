/** The locale a call on any resource addresses. */

import type { ResourceSpec } from './resources';
import type { ResolvedConfig } from '@/types/index';
import { defaultContentLocale } from '@/config/content-locale';
import { ResourceValidationError } from '@/errors/resource';

/**
 * The locale a call addresses, the default content locale when it names none. A
 * target that is not translatable lives in the default locale alone, so any
 * other is a caller error rather than a silent write to the wrong row.
 */
export function resolveResourceLocale(
    spec: ResourceSpec,
    config: ResolvedConfig,
    target: string | undefined,
    locale: string | undefined
): string {
    const defaultLocale = defaultContentLocale(config);
    const resolved = locale ?? defaultLocale;
    if (resolved !== defaultLocale && !spec.translatable(config, target)) {
        throw new ResourceValidationError([
            `${spec.name(target)} is not translatable, so only the ` +
                `'${defaultLocale}' locale can be written.`,
        ]);
    }
    return resolved;
}
