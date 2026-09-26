/** The content row a user's version methods address. */

import type { UserResource } from '../repository';
import type { ResolvedConfig } from '@/types/index';
import { resolveResourceLocale } from '@/content/locale';
import { RESOURCE_SPECS } from '@/content/resources';
import { ResourceNotFoundError } from '@/errors/resource';
import { userRepository } from '../repository';

/**
 * The user in the locale a version method addresses. Unlike a read, this does
 * not fall back to the default locale: a locale with no content row throws.
 */
export async function getUserInLocale(
    config: ResolvedConfig,
    params: { id: string; locale?: string | undefined }
): Promise<UserResource> {
    const locale = resolveResourceLocale(
        RESOURCE_SPECS.user,
        config,
        undefined,
        params.locale
    );
    const current = await userRepository.findOne(params.id, { locale });
    if (!current) throw new ResourceNotFoundError('user', { id: params.id, locale });
    return current;
}
