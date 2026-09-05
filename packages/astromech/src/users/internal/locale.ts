/**
 * The locale a users call addresses, and the repository bound to the configured
 * default content locale. Users opt into translation through
 * `users: { translatable: true }`; without it a profile's content lives in the
 * default locale alone.
 */

import type { UserRepository } from '../repository';
import type { ResolvedConfig } from '@/types/index';
import { defaultContentLocale } from '@/config/content-locale';
import { UserValidationError } from '../errors';
import { createUserRepository } from '../repository';

/**
 * The locale a call addresses. Non-translatable users live in the default
 * content locale alone, so any other locale is a caller error rather than a
 * silent write to the wrong row.
 */
export function resolveUserLocale(config: ResolvedConfig, locale?: string): string {
    const defaultLocale = defaultContentLocale(config);
    const resolved = locale ?? defaultLocale;
    if (resolved !== defaultLocale && !config.users.translatable) {
        throw new UserValidationError([
            `Users are not translatable, so only the '${defaultLocale}' locale ` +
                `can be written.`,
        ]);
    }
    return resolved;
}

/** The user repository, bound to the configured default content locale. */
export function userRepository(config: ResolvedConfig): UserRepository {
    return createUserRepository({ defaultLocale: defaultContentLocale(config) });
}
