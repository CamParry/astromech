/**
 * Reading one user, with the fallback a user read promises: the asked locale,
 * then the default locale, then the account row alone. The last step is here
 * because better-auth mints `users` rows outside Astromech's write path, so a
 * user can exist with no content row at all, and a session must not fail on a
 * profile nobody has written.
 */

import type { UserRepository, UserRow } from '../repository';

/** One user, read through the locale fallback chain. */
export async function readUser(
    repository: UserRepository,
    id: string,
    locale?: string
): Promise<UserRow | null> {
    return (
        (await repository.get(id, locale)) ??
        (await repository.get(id)) ??
        (await repository.accountRow(id))
    );
}
