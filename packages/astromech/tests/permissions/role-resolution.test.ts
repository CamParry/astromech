/**
 * What `resolveRole` answers for a slug the config does not define: nothing. A
 * fallback role would let a typo on a user row, or a config edit that removed a
 * role, grant the fallback's permissions to everyone holding the slug.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/errors/validation';
import { getRole, resolveRole, resolveRoles } from '@/permissions/roles';

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

    // The resolved map is a plain object, so `constructor` and the like are
    // inherited properties of it, not roles.
    it('answers null for a name only Object.prototype holds', () => {
        for (const slug of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
            expect(resolveRole(config, slug)).toBeNull();
        }
    });
});

describe('resolveRoles', () => {
    // A computed key or a parsed JSON object can hold `__proto__` as an own
    // key. Assigned into the plain result object, it would set its prototype.
    it('rejects a role slug "__proto__"', () => {
        const roles = JSON.parse(
            '{"__proto__": {"name": "Odd", "permissions": ["media:read"]}}'
        ) as Record<string, { name: string; permissions: string[] }>;

        expect(() => resolveRoles({ roles })).toThrow(
            /role slug must not be "__proto__"/
        );
    });
});

describe('getRole', () => {
    it('returns a configured role', () => {
        expect(getRole(config, 'admin').permissions).toEqual(['*']);
    });

    it('rejects an unknown slug as a field error naming the configured roles', () => {
        try {
            getRole(config, 'reviewer');
            expect.unreachable('getRole should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
            const message = (err as ValidationError).fields?.role?.[0] ?? '';
            expect(message).toContain('reviewer');
            expect(message).toContain('admin, editor');
        }
    });
});
