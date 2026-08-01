/**
 * Session resolution.
 *
 * The single place a Better Auth session is turned into an Astromech identity
 * (full user row + resolved role). It lives in the `users` domain rather than a
 * transport so every entry point — the Astro middleware, the Hono auth
 * middleware, the cron poke route — resolves the SAME identity from the same
 * headers, instead of each hand-building its own user shape.
 */

import config from 'virtual:astromech/config';
import { auth } from './auth.js';
import { createUserStorage } from './storage.js';
import { resolveRole } from '@/permissions/index.js';
import type { User, Role } from '@/types/index.js';

/** The session record Better Auth returns alongside the user. */
type AuthSession = NonNullable<
    Awaited<ReturnType<typeof auth.api.getSession>>
>['session'];

/**
 * Resolve the Better Auth session into a full user row + role + session, or
 * null if there is no valid session.
 */
export async function resolveSessionUser(
    headers: Headers
): Promise<{ user: User; role: Role; session: AuthSession } | null> {
    const session = await auth.api.getSession({ headers });
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
        role: resolveRole(config, userRow.roleSlug),
        session: session.session,
    };
}
