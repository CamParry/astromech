/** The locale a call on any resource addresses, and the resource read in it. */

import type { ResolvedConfig, ResourceType } from '@/types/index';
import { defaultContentLocale } from '@/config/content-locale';
import { ResourceNotFoundError, ResourceValidationError } from '@/errors/resource';
import { RESOURCE_CONFIG } from './resources';

/**
 * The locale a call addresses, the default content locale when it names none. A
 * target that is not translatable lives in the default locale alone, so any
 * other is a caller error rather than a silent write to the wrong row.
 */
export function resolveResourceLocale(
    resource: ResourceType,
    config: ResolvedConfig,
    target: string | undefined,
    locale: string | undefined
): string {
    const resourceConfig = RESOURCE_CONFIG[resource];
    const defaultLocale = defaultContentLocale(config);
    const resolved = locale ?? defaultLocale;
    if (resolved !== defaultLocale && !resourceConfig.translatable(config, target)) {
        throw new ResourceValidationError([
            `${resourceConfig.name(target)} is not translatable, so only the ` +
                `'${defaultLocale}' locale can be written.`,
        ]);
    }
    return resolved;
}

/**
 * The resource in the locale a version method addresses. Unlike a read, this does
 * not fall back to the default locale: a locale with no content row throws.
 */
export async function getResourceInLocale<T>(
    resource: ResourceType,
    config: ResolvedConfig,
    repository: { findOne(id: string, options: { locale: string }): Promise<T | null> },
    params: { id: string; locale?: string | undefined }
): Promise<T> {
    const locale = resolveResourceLocale(resource, config, undefined, params.locale);
    const current = await repository.findOne(params.id, { locale });
    if (!current) throw new ResourceNotFoundError(resource, { id: params.id, locale });
    return current;
}
