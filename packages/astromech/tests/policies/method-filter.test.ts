/**
 * Method filtering — the structural half of capability limiting.
 *
 * The point being tested is precedence, not matching. `readOnly` beating an
 * explicit `include` is what makes the flag a security filter rather than a
 * default, and it is the one rule a well-meaning refactor would "fix".
 */

import type {
    CoreManifestMethod,
    EntriesManifestMethod,
    ManifestMethod,
} from '@/types/index';
import { describe, expect, it } from 'vitest';
import { filterMethods } from '@/policies/method-filter';

function coreMethod(domain: string, name: string, mutates: boolean): CoreManifestMethod {
    return {
        id: `${domain}.${name}`,
        name: `${domain}.${name}`,
        source: 'core',
        domain,
        method: name,
        permission: null,
        mutates,
        destructive: false,
        idempotent: false,
    };
}

function entryMethod(
    type: string,
    name: string,
    mutates: boolean
): EntriesManifestMethod {
    return {
        id: `entries.${type}.${name}`,
        // Not unique — every entry type's create is named `entries.create`.
        name: `entries.${name}`,
        source: 'entries',
        method: name,
        typeId: type,
        entryType: type,
        mount: 'root',
        permission: `entry:${type}:${name}`,
        mutates,
        destructive: false,
        idempotent: false,
    };
}

const methods: ManifestMethod[] = [
    coreMethod('users', 'query', false),
    coreMethod('users', 'create', true),
    coreMethod('settings', 'get', false),
    coreMethod('settings', 'set', true),
    entryMethod('posts', 'get', false),
    entryMethod('posts', 'publish', true),
    entryMethod('pages', 'get', false),
];

const ids = (result: { methods: ManifestMethod[] }): string[] =>
    result.methods.map((m) => m.id);

describe('readOnly', () => {
    it('drops a mutating method even when include names it explicitly', () => {
        // THE verify criterion. GitHub's MCP server documents `--read-only` as
        // "a strict security filter that takes precedence over any other
        // configuration, disabling write tools even when explicitly requested".
        // Those semantics are copied deliberately: a read-only flag a caller can
        // widen by naming a method is a comment, not a filter.
        const result = filterMethods(methods, {
            readOnly: true,
            include: ['users.create'],
        });

        expect(ids(result)).not.toContain('users.create');
        expect(result.excluded).toContainEqual({
            id: 'users.create',
            reason: 'read-only surface: method mutates state',
        });
    });

    it('keeps every non-mutating method', () => {
        const result = filterMethods(methods, { readOnly: true });

        expect(ids(result)).toEqual([
            'users.query',
            'settings.get',
            'entries.posts.get',
            'entries.pages.get',
        ]);
        expect(result.methods.every((m) => !m.mutates)).toBe(true);
    });
});

describe('exclude', () => {
    it('drops the named method, with a reason', () => {
        const result = filterMethods(methods, { exclude: ['settings.set'] });

        expect(ids(result)).not.toContain('settings.set');
        expect(result.excluded).toEqual([
            { id: 'settings.set', reason: 'excluded by surface policy' },
        ]);
    });
});

describe('include', () => {
    it('keeps only matches when non-empty', () => {
        const result = filterMethods(methods, {
            include: ['users.query', 'settings.set'],
        });

        expect(ids(result)).toEqual(['users.query', 'settings.set']);
        expect(
            result.excluded.every((e) => e.reason === 'not in the included surface')
        ).toBe(true);
    });

    it('keeps everything when empty or absent', () => {
        expect(ids(filterMethods(methods, { include: [] }))).toHaveLength(methods.length);
        expect(ids(filterMethods(methods, {}))).toHaveLength(methods.length);
    });
});

describe('pattern matching', () => {
    it('prefix-matches on a trailing star', () => {
        const result = filterMethods(methods, { include: ['entries.*'] });

        expect(ids(result)).toEqual([
            'entries.posts.get',
            'entries.posts.publish',
            'entries.pages.get',
        ]);
        expect(ids(result)).not.toContain('users.create');
    });

    it('addresses exactly one method by its full id', () => {
        const result = filterMethods(methods, { include: ['entries.posts.publish'] });

        expect(ids(result)).toEqual(['entries.posts.publish']);
    });

    it('matches on name as well as id, which is broad on purpose', () => {
        // `entries.get` is the NAME of every entry type's get, so a name pattern
        // reaches all of them.
        const result = filterMethods(methods, { exclude: ['entries.get'] });

        expect(ids(result)).not.toContain('entries.posts.get');
        expect(ids(result)).not.toContain('entries.pages.get');
        expect(ids(result)).toContain('entries.posts.publish');
    });
});

describe('accounting', () => {
    it('accounts for every dropped method exactly once', () => {
        const result = filterMethods(methods, {
            readOnly: true,
            exclude: ['settings.get'],
            include: ['users.*', 'settings.*'],
        });

        expect(result.methods.length + result.excluded.length).toBe(methods.length);
        expect(new Set(result.excluded.map((e) => e.id)).size).toBe(
            result.excluded.length
        );

        const seen = [...ids(result), ...result.excluded.map((e) => e.id)].sort();
        expect(seen).toEqual(methods.map((m) => m.id).sort());
    });

    it('is a no-op with no options', () => {
        const result = filterMethods(methods, {});

        expect(result.methods).toEqual(methods);
        expect(result.excluded).toEqual([]);
    });
});
