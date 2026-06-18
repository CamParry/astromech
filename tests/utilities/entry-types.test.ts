import { describe, expect, it } from 'vitest';
import {
    parseEntryTypeId,
    qualifyEntryType,
    resolveEntryType,
} from '@/entries/type-registry.js';
import type { ResolvedConfig, ResolvedEntryTypeConfig } from '@/types/index.js';

const entryType = (single: string): ResolvedEntryTypeConfig => ({
    single,
    plural: `${single}s`,
    fields: { main: [], sidebar: [] },
    capabilities: {
        statuses: true,
        slug: true,
        translatable: false,
        versioning: false,
        trash: true,
    },
    titleField: 'title',
});

const config: Pick<ResolvedConfig, 'entries' | 'pluginEntries'> = {
    entries: { post: entryType('Post') },
    pluginEntries: {
        redirects: { redirect: entryType('Redirect') },
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
    it('resolves bare ids against root entries', () => {
        expect(resolveEntryType(config, 'post')).toBe(config.entries.post);
    });

    it('resolves qualified ids against pluginEntries', () => {
        expect(resolveEntryType(config, 'redirects/redirect')).toBe(
            config.pluginEntries.redirects?.redirect
        );
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
