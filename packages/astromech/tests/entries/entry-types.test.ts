import type { ResolvedConfig, ResolvedEntryType } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { qualifyEntryType, resolveEntryType } from '@/entries/entry-types';

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
        'forms/form': entryType('forms/form', 'Form'),
    },
};

describe('qualifyEntryType', () => {
    it('joins plugin and type with the separator', () => {
        expect(qualifyEntryType('forms', 'form')).toBe('forms/form');
    });
});

describe('resolveEntryType', () => {
    it('resolves a site id and a plugin id from the one map', () => {
        expect(resolveEntryType(config, 'post')).toBe(config.entryTypes['post']);
        expect(resolveEntryType(config, 'forms/form')).toBe(
            config.entryTypes['forms/form']
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
        expect(resolveEntryType(config, 'unknown/form')).toBeUndefined();
    });

    it('returns undefined for unknown type in known plugin', () => {
        expect(resolveEntryType(config, 'forms/nope')).toBeUndefined();
    });
});
