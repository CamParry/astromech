/**
 * Request-scoped context.
 *
 * Two things are pinned here: identity is scoped to the request, not to the
 * module (the concurrency case, which the module-level `currentUser` this
 * replaced failed only under interleaving), and a request that never asks who
 * the caller is resolves no session at all.
 */

import type { Role, User } from '@/types/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getCurrentRole,
    getCurrentUser,
    getRequestContext,
    runWithContext,
    runWithRequest,
} from '@/request-context/request-context';
import { getSession } from '@/users/session';

vi.mock('@/users/session', () => ({ getSession: vi.fn() }));

const mockGetSession = vi.mocked(getSession);

function makeUser(id: string): User {
    return {
        id,
        email: `${id}@test.dev`,
        name: id,
        emailVerified: true,
        image: null,
        fields: null,
        role: 'admin',
        createdAt: new Date(0),
        updatedAt: new Date(0),
    };
}

const adminRole: Role = {
    slug: 'admin',
    name: 'Administrator',
    permissions: ['*'],
    isBuiltIn: true,
};

/** A promise plus its resolver, so tests can order the interleaving by hand. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve = (): void => undefined;
    const promise = new Promise<void>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

/** Answer the next session resolve with `user` under `adminRole`, or with none. */
function signIn(user: User | null): void {
    mockGetSession.mockResolvedValue(
        user === null
            ? null
            : { user, role: adminRole, session: { id: 's1', userId: user.id } as never }
    );
}

const request = (): Request => new Request('http://localhost/');

beforeEach(() => {
    mockGetSession.mockReset();
    signIn(null);
});

describe('request context', () => {
    it('has no user outside a context, and resolves no session to say so', async () => {
        expect(await getCurrentUser()).toBeNull();
        expect(await getCurrentRole()).toBeNull();
        expect(getRequestContext()).toBeUndefined();
        expect(mockGetSession).not.toHaveBeenCalled();
    });

    it('resolves nothing for a request that never asks who the caller is', async () => {
        const seen = await runWithRequest(request(), async () => 'served');

        expect(seen).toBe('served');
        expect(mockGetSession).not.toHaveBeenCalled();
    });

    it('resolves identity on the first ask and reuses it for the rest', async () => {
        const user = makeUser('a');
        signIn(user);

        await runWithRequest(request(), async () => {
            expect(await getCurrentUser()).toBe(user);
            expect(await getCurrentRole()).toBe(adminRole);
            expect(await getCurrentUser()).toBe(user);
        });

        expect(mockGetSession).toHaveBeenCalledTimes(1);
        expect(await getCurrentUser()).toBeNull();
        expect(getRequestContext()).toBeUndefined();
    });

    it('caches a missing session too, rather than retrying it', async () => {
        await runWithRequest(request(), async () => {
            expect(await getCurrentUser()).toBeNull();
            expect(await getCurrentRole()).toBeNull();
        });

        expect(mockGetSession).toHaveBeenCalledTimes(1);
    });

    it('takes a seeded user without resolving one', async () => {
        const user = makeUser('a');

        const seen = await runWithContext(
            { request: request(), user, role: adminRole },
            async () => {
                expect(await getCurrentRole()).toBe(adminRole);
                return getCurrentUser();
            }
        );

        expect(seen).toBe(user);
        expect(mockGetSession).not.toHaveBeenCalled();
    });

    it("keeps concurrent requests from seeing each other's user", async () => {
        const userA = makeUser('a');
        const userB = makeUser('b');

        // Hand-ordered interleaving: A suspends, B establishes ITS identity
        // while A is suspended, then A resumes and reads again. Under the old
        // module-level `currentUser`, B's write would have clobbered A's and
        // the second A read below would return user 'b'.
        const bEntered = deferred();
        const aResumed = deferred();

        const requestA = runWithContext(
            { request: request(), user: userA, role: null },
            async () => {
                expect(await getCurrentUser()).toBe(userA);
                await bEntered.promise;
                const afterSuspension = await getCurrentUser();
                aResumed.resolve();
                return afterSuspension;
            }
        );

        const requestB = runWithContext(
            { request: request(), user: userB, role: null },
            async () => {
                expect(await getCurrentUser()).toBe(userB);
                bEntered.resolve();
                await aResumed.promise;
                return getCurrentUser();
            }
        );

        const [seenByA, seenByB] = await Promise.all([requestA, requestB]);

        expect(seenByA).toBe(userA);
        expect(seenByB).toBe(userB);
        expect(await getCurrentUser()).toBeNull();
    });

    it('restores the outer context after a nested one returns', async () => {
        const outer = makeUser('outer');
        const inner = makeUser('inner');

        await runWithContext(
            { request: request(), user: outer, role: null },
            async () => {
                expect(await getCurrentUser()).toBe(outer);

                await runWithContext(
                    { request: request(), user: inner, role: adminRole },
                    async () => {
                        expect(await getCurrentUser()).toBe(inner);
                        expect(await getCurrentRole()).toBe(adminRole);
                    }
                );

                expect(await getCurrentUser()).toBe(outer);
                expect(await getCurrentRole()).toBeNull();
            }
        );
    });
});
