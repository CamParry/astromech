/**
 * Session resolution: the single place a Better Auth session is turned into an
 * Astromech identity (full user row + resolved role). It reads the users
 * repository; `users` never imports `auth`. `request-scope/` is its one caller.
 */

import type { Role, User } from '@/types/index';
import { getAuth } from '@/auth/better-auth';
import { getDefaultContentLocale } from '@/config/content-locale';
import { getConfig } from '@/config/registry';
import { resolveRole } from '@/permissions/roles';
import { toUser } from '@/users/internal/to-user';
import { getUserRepository } from '@/users/repository';
import { log } from '@/utilities/log';

/** What Better Auth's `getSession` resolves to — null when there is no session. */
type GetSessionResult = Awaited<
    ReturnType<ReturnType<typeof getAuth>['api']['getSession']>
>;

/** The session record Better Auth returns alongside the user. */
type AuthSession = NonNullable<GetSessionResult>['session'];

/**
 * Resolve the Better Auth session into a full user row + role + session, or
 * null if there is no valid session.
 */
export async function getSession(
    headers: Headers
): Promise<{ user: User; role: Role; session: AuthSession } | null> {
    const session = await getAuth().api.getSession({ headers });
    if (!session?.user) return null;

    // Load the full user row (Better Auth session may not include custom fields)
    const userRow = await getUserRepository().findOne(session.user.id, {
        fallbackLocale: getDefaultContentLocale(),
    });
    if (!userRow) return null;

    const user = toUser(userRow);

    // A role the config no longer defines refuses the session rather than
    // resolving to something. Removing a role from `astromech.config.ts` logs
    // out everyone who held it, which is visible; the alternative is granting
    // them a role nobody chose, which is not.
    const role = resolveRole(getConfig(), userRow.role);
    if (!role) {
        log.warn(
            `User ${userRow.id} holds role "${userRow.role}", which is not in the config. Refusing the session. Configured roles are in \`astromech.config.ts\`.`
        );
        return null;
    }

    return { user, role, session: session.session };
}
