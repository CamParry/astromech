/**
 * What `resolveRole` answers for a slug the config does not define.
 *
 * The answer used to be the admin role, which meant a typo on a user row, or an
 * ordinary config edit that removed a role, granted `*` to everyone holding it.
 * These pin that there is no fallback at all.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/errors/validation';
import { requireRole, resolveRole, resolveRoles } from '@/permissions/roles';

const config = { resolvedRoles: resolveRoles({}) };

describe('resolveRole', () => {
    it('resolves a configured slug', () => {
        expect(resolveRole(config, 'editor')?.slug).toBe('editor');
    });

    it('answers null for an unknown slug rather than a role', () => {
        expect(resolveRole(config, 'reviewer')).toBeNull();
    });

    // The config-edit case: a role that existed when the user row was written
    // and does not exist now. Nothing about the row changed, so nothing but
    // this lookup can notice.
    it('answers null for a slug a later config edit removed', () => {
        const withReviewer = {
            resolvedRoles: resolveRoles({
                roles: { reviewer: { name: 'Reviewer', permissions: ['media:read'] } },
            }),
        };
        expect(resolveRole(withReviewer, 'reviewer')?.slug).toBe('reviewer');
        expect(resolveRole(config, 'reviewer')).toBeNull();
    });

    it('never answers admin for an unknown slug', () => {
        for (const slug of ['', 'admin ', 'ADMIN', 'administrator', 'root']) {
            expect(resolveRole(config, slug)).toBeNull();
        }
    });
});

describe('requireRole', () => {
    it('returns a configured role', () => {
        expect(requireRole(config, 'admin').permissions).toEqual(['*']);
    });

    it('rejects an unknown slug as a field error naming the configured roles', () => {
        try {
            requireRole(config, 'reviewer');
            expect.unreachable('requireRole should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
            const message = (err as ValidationError).fields?.role?.[0] ?? '';
            expect(message).toContain('reviewer');
            expect(message).toContain('admin, editor');
        }
    });
});
