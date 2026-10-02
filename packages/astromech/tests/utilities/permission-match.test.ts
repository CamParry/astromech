/**
 * Segment-wise permission matching over the action-last grammar
 * (`resource[:identifier]:action`): `*` alone grants everything, a `*` mid
 * pattern matches one segment, and a trailing `*` one or more.
 */

import { describe, expect, it } from 'vitest';
import { hasPermission, matchesPermission } from '@/utilities/permission-match';

describe('matchesPermission', () => {
    it.each([
        // `*` alone
        ['*', 'entry:posts:read', true],
        ['*', 'plugin:x:y', true],
        // exact
        ['entry:posts:read', 'entry:posts:read', true],
        ['entry:posts:read', 'entry:pages:read', false],
        ['entry:posts:read', 'entry:posts:update', false],
        // a trailing `*` matches one or more remaining segments
        ['entry:*', 'entry:posts', true],
        ['entry:*', 'entry:posts:read', true],
        ['entry:*', 'entry', false],
        ['media:*', 'media:read', true],
        ['entry:posts:*', 'entry:posts:read', true],
        ['entry:posts:*', 'entry:pages:read', false],
        ['plugin:*', 'plugin:ns:view', true],
        ['plugin:*', 'plugin:ns:entry:redirect:read', true],
        ['plugin:ns:*', 'plugin:ns:lookup', true],
        // a mid `*` matches exactly one segment
        ['entry:*:read', 'entry:posts:read', true],
        ['entry:*:read', 'entry:a:b:read', false],
        ['entry:*:read', 'entry:read', false],
        ['entry:*:read', 'entry:posts', false],
        // a pattern shorter than the check, with no trailing `*`
        ['entry:posts', 'entry:posts:read', false],
        // the root segment never crosses over
        ['entry:*', 'plugin:ns:entry:redirect:read', false],
        ['plugin:*', 'entry:posts:read', false],
    ])('%s against %s is %s', (pattern, check, expected) => {
        expect(matchesPermission(pattern, check)).toBe(expected);
    });
});

describe('hasPermission', () => {
    it.each<[string[], string, boolean]>([
        [[], 'entry:posts:read', false],
        [['entry:posts:update', 'entry:*:read'], 'entry:posts:read', true],
        [['entry:posts:update', 'media:read'], 'entry:posts:read', false],
        [['*'], 'anything:goes:here', true],
    ])('%j grants %s: %s', (permissions, check, expected) => {
        expect(hasPermission(permissions, check)).toBe(expected);
    });
});
