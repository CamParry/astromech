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
import { parseOutput } from '@/services/parse-method-output';
import { userRepository } from '@/users/repository';
import { userSchema } from '@/users/schema';
import { log } from '@/utilities/log';

/** What Better Auth's `getSession` resolves to — null when there is no session. */
type GetSessionResult = Awaited<
    ReturnType<ReturnType<typeof getAuth>['api']['getSession']>
>;

/** The session record Better Auth returns alongside the user. */
type AuthSession = NonNullable<GetSessionResult>['session'];

/**
 * Resolve the Better Auth session into the user, role and session, or null when
 * there is no valid session or the user it names has no content row.
 */
export async function getSession(
    headers: Headers
): Promise<{ user: User; role: Role; session: AuthSession } | null> {
    const session = await getAuth().api.getSession({ headers });
    if (!session?.user) return null;

    // Load the whole user: Better Auth's session carries no custom fields.
    const resource = await userRepository.findOne(session.user.id, {
        fallbackLocale: getDefaultContentLocale(),
    });
    if (!resource) return null;

    // The request scope hands this user to `Astro.locals`, hooks and plugins,
    // so it leaves core in the public shape.
    const user = parseOutput(userSchema, resource, 'The session user');

    // A role the config no longer defines refuses the session rather than
    // resolving to something. Removing a role from `astromech.config.ts` logs
    // out everyone who held it, which is visible; the alternative is granting
    // them a role nobody chose, which is not.
    const role = resolveRole(getConfig(), resource.role);
    if (!role) {
        log.warn(
            `User ${resource.id} holds role "${resource.role}", which is not in the config. Refusing the session. Configured roles are in \`astromech.config.ts\`.`
        );
        return null;
    }

    return { user, role, session: session.session };
}
