/**
 * Request-scoped context.
 *
 * The point of this suite is the concurrency case: identity must be scoped to
 * the request, not to the module. The module-level `currentUser` variable this
 * replaced passed every other test here and failed only under interleaving.
 */

import { describe, expect, it } from 'vitest';
import {
    getCurrentRole,
    getCurrentUser,
    getRequestContext,
    runWithContext,
} from '@/context/index.js';
import type { Role, User } from '@/types/index.js';

function makeUser(id: string): User {
    return {
        id,
        email: `${id}@test.dev`,
        name: id,
        emailVerified: true,
        image: null,
        fields: null,
        roleSlug: 'admin',
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

describe('request context', () => {
    it('has no user outside a context', () => {
        expect(getCurrentUser()).toBeNull();
        expect(getCurrentRole()).toBeNull();
        expect(getRequestContext()).toBeUndefined();
    });

    it('exposes the user inside the callback and nowhere after it', () => {
        const user = makeUser('a');

        const seen = runWithContext({ user, role: adminRole }, () => {
            expect(getRequestContext()).toEqual({ user, role: adminRole });
            expect(getCurrentRole()).toBe(adminRole);
            return getCurrentUser();
        });

        expect(seen).toBe(user);
        expect(getCurrentUser()).toBeNull();
        expect(getRequestContext()).toBeUndefined();
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

        const requestA = runWithContext({ user: userA, role: null }, async () => {
            expect(getCurrentUser()).toBe(userA);
            await bEntered.promise;
            const afterSuspension = getCurrentUser();
            aResumed.resolve();
            return afterSuspension;
        });

        const requestB = runWithContext({ user: userB, role: null }, async () => {
            expect(getCurrentUser()).toBe(userB);
            bEntered.resolve();
            await aResumed.promise;
            return getCurrentUser();
        });

        const [seenByA, seenByB] = await Promise.all([requestA, requestB]);

        expect(seenByA).toBe(userA);
        expect(seenByB).toBe(userB);
        expect(getCurrentUser()).toBeNull();
    });

    it('restores the outer context after a nested one returns', () => {
        const outer = makeUser('outer');
        const inner = makeUser('inner');

        runWithContext({ user: outer, role: null }, () => {
            expect(getCurrentUser()).toBe(outer);

            runWithContext({ user: inner, role: adminRole }, () => {
                expect(getCurrentUser()).toBe(inner);
                expect(getCurrentRole()).toBe(adminRole);
            });

            expect(getCurrentUser()).toBe(outer);
            expect(getCurrentRole()).toBeNull();
        });
    });
});
