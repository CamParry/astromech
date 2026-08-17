/**
 * Session resolution.
 *
 * The single place a Better Auth session is turned into an Astromech identity
 * (full user row + resolved role). It lives in the `users` domain rather than a
 * transport, and `request-context/` is its one caller: every entry point reads
 * identity through the request scope instead of hand-building a user shape.
 */

import { getConfig } from '@/config/registry';
import { getAuth } from './auth';
import { createUserStorage } from './storage';
import { resolveRole } from '@/permissions/index';
import type { User, Role } from '@/types/index';

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
    const userRow = await createUserStorage().get(session.user.id);
    if (!userRow) return null;

    const user: User = {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        emailVerified: userRow.emailVerified,
        image: userRow.image,
        fields: (userRow.fields as User['fields']) ?? null,
        roleSlug: userRow.roleSlug,
        createdAt: userRow.createdAt,
        updatedAt: userRow.updatedAt,
    };

    return {
        user,
        role: resolveRole(getConfig(), userRow.roleSlug),
        session: session.session,
    };
}
