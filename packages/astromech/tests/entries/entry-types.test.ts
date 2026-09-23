import type { ResolvedConfig, ResolvedEntryType } from '@/types/index';
import { describe, expect, it } from 'vitest';
import {
    parseEntryTypeId,
    qualifyEntryType,
    resolveEntryType,
} from '@/entries/entry-types';

const entryType = (id: string, single: string): ResolvedEntryType => ({
    id,
    single,
    plural: `${single}s`,
    fields: { main: [], sidebar: [] },
    capabilities: {
        statuses: true,
        slug: true,
        translatable: false,
        versioning: false,
        staging: false,
        trash: true,
    },
    titleField: 'title',
});

const config: Pick<ResolvedConfig, 'entryTypes'> = {
    entryTypes: {
        post: entryType('post', 'Post'),
        'redirects/redirect': entryType('redirects/redirect', 'Redirect'),
    },
};

describe('parseEntryTypeId', () => {
    it('returns null for bare ids', () => {
        expect(parseEntryTypeId('post')).toBeNull();
    });

    it('parses qualified ids', () => {
        expect(parseEntryTypeId('redirects/redirect')).toEqual({
            plugin: 'redirects',
            type: 'redirect',
        });
    });

    it('splits on the first separator only', () => {
        expect(parseEntryTypeId('plugin/nested/type')).toEqual({
            plugin: 'plugin',
            type: 'nested/type',
        });
    });
});

describe('qualifyEntryType', () => {
    it('joins plugin and type with the separator', () => {
        expect(qualifyEntryType('redirects', 'redirect')).toBe('redirects/redirect');
    });
});

describe('resolveEntryType', () => {
    it('resolves a site id and a plugin id from the one map', () => {
        expect(resolveEntryType(config, 'post')).toBe(config.entryTypes['post']);
        expect(resolveEntryType(config, 'redirects/redirect')).toBe(
            config.entryTypes['redirects/redirect']
        );
    });

    it('names nothing by an inherited property', () => {
        expect(resolveEntryType(config, 'constructor')).toBeUndefined();
        expect(resolveEntryType(config, 'toString')).toBeUndefined();
    });

    it('returns undefined for unknown bare ids', () => {
        expect(resolveEntryType(config, 'nope')).toBeUndefined();
    });

    it('returns undefined for unknown plugin', () => {
        expect(resolveEntryType(config, 'unknown/redirect')).toBeUndefined();
    });

    it('returns undefined for unknown type in known plugin', () => {
        expect(resolveEntryType(config, 'redirects/nope')).toBeUndefined();
    });
});
