import { describe, expect, it } from 'vitest';
import { hasPermission, matchesPermission } from '@/core/permission-match.js';

describe('matchesPermission', () => {
    describe('global wildcard', () => {
        it('grants everything with *', () => {
            expect(matchesPermission('*', 'entry:read:posts')).toBe(true);
            expect(matchesPermission('*', 'plugin:x:y')).toBe(true);
        });
    });

    describe('exact match', () => {
        it('matches identical strings', () => {
            expect(matchesPermission('entry:read:posts', 'entry:read:posts')).toBe(true);
        });

        it('rejects literal mismatch', () => {
            expect(matchesPermission('entry:read:posts', 'entry:read:pages')).toBe(false);
            expect(matchesPermission('entry:read:posts', 'entry:write:posts')).toBe(
                false
            );
        });
    });

    describe('trailing * (one or more remaining segments)', () => {
        it('entry:* matches entry:posts', () => {
            expect(matchesPermission('entry:*', 'entry:posts')).toBe(true);
        });

        it('entry:* matches entry:posts:read', () => {
            expect(matchesPermission('entry:*', 'entry:posts:read')).toBe(true);
        });

        it('entry:* does not match entry (no remainder)', () => {
            expect(matchesPermission('entry:*', 'entry')).toBe(false);
        });

        it('media:* matches media:read', () => {
            expect(matchesPermission('media:*', 'media:read')).toBe(true);
        });

        it('plugin:* matches plugin:ns:view', () => {
            expect(matchesPermission('plugin:*', 'plugin:ns:view')).toBe(true);
        });

        it('plugin:* matches deeply nested plugin permission', () => {
            expect(matchesPermission('plugin:*', 'plugin:ns:entry:redirect:read')).toBe(
                true
            );
        });
    });

    describe('mid * (exactly one segment)', () => {
        it('entry:*:read matches entry:posts:read', () => {
            expect(matchesPermission('entry:*:read', 'entry:posts:read')).toBe(true);
        });

        it('entry:*:read does not match entry:a:b:read (extra segment)', () => {
            expect(matchesPermission('entry:*:read', 'entry:a:b:read')).toBe(false);
        });

        it('entry:*:read does not match entry:read (too short)', () => {
            expect(matchesPermission('entry:*:read', 'entry:read')).toBe(false);
        });
    });

    describe('pattern shorter than check, no trailing *', () => {
        it('entry:posts does not match entry:posts:read', () => {
            expect(matchesPermission('entry:posts', 'entry:posts:read')).toBe(false);
        });
    });

    describe('pattern longer than check', () => {
        it('entry:*:read does not match entry:posts', () => {
            expect(matchesPermission('entry:*:read', 'entry:posts')).toBe(false);
        });
    });

    describe('structural root isolation', () => {
        it('entry:* does not match plugin:ns:entry:redirect:read', () => {
            expect(matchesPermission('entry:*', 'plugin:ns:entry:redirect:read')).toBe(
                false
            );
        });

        it('plugin:* does not match entry:posts:read', () => {
            expect(matchesPermission('plugin:*', 'entry:posts:read')).toBe(false);
        });
    });

    describe('old-grammar compat (superset proof)', () => {
        it('entry:read:* matches entry:read:posts', () => {
            expect(matchesPermission('entry:read:*', 'entry:read:posts')).toBe(true);
        });

        it('plugin:ns:* matches plugin:ns:lookup', () => {
            expect(matchesPermission('plugin:ns:*', 'plugin:ns:lookup')).toBe(true);
        });
    });
});

describe('hasPermission', () => {
    it('returns false for empty array', () => {
        expect(hasPermission([], 'entry:read:posts')).toBe(false);
    });

    it('returns true when any pattern matches', () => {
        expect(
            hasPermission(['entry:write:posts', 'entry:read:*'], 'entry:read:posts')
        ).toBe(true);
    });

    it('returns false when no pattern matches', () => {
        expect(
            hasPermission(['entry:write:posts', 'media:read'], 'entry:read:posts')
        ).toBe(false);
    });

    it('returns true on global * in array', () => {
        expect(hasPermission(['*'], 'anything:goes:here')).toBe(true);
    });
});
