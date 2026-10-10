import type { EntryType } from '@/types/index';
import { invalid } from '@tests/fixtures';
import { describe, expect, it } from 'vitest';
import {
    assertEntryTypeValid,
    resolveEntryTypes,
    toResolvedEntryCapabilities,
} from '@/config/entry-types';
import { definePlugin } from '@/plugins/define-plugin';

describe('toResolvedEntryCapabilities — defaults', () => {
    const emptyCfg: EntryType = {
        type: 'item',
        single: 'Item',
        plural: 'Items',
    };

    it('statuses defaults ON', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg);
        expect(caps.statuses).toBe(true);
    });

    it('slug defaults ON', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg);
        expect(caps.slug).toBe(true);
    });

    it('trash defaults ON', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg);
        expect(caps.trash).toBe(true);
    });

    it('versioning defaults OFF', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg);
        expect(caps.versioning).toBe(false);
    });

    it('translatable defaults OFF', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg);
        expect(caps.translatable).toBe(false);
    });

    it('staging defaults OFF', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg);
        expect(caps.staging).toBe(false);
    });
});

describe('toResolvedEntryCapabilities — explicit opt-outs', () => {
    it('statuses:false resolves off', () => {
        const cfg: EntryType = {
            type: 'item',
            single: 'Item',
            plural: 'Items',
            statuses: false,
        };
        expect(toResolvedEntryCapabilities(cfg).statuses).toBe(false);
    });

    it('slug:false resolves off', () => {
        const cfg: EntryType = {
            type: 'item',
            single: 'Item',
            plural: 'Items',
            slug: false,
        };
        expect(toResolvedEntryCapabilities(cfg).slug).toBe(false);
    });

    it('trash:false resolves off', () => {
        const cfg: EntryType = {
            type: 'item',
            single: 'Item',
            plural: 'Items',
            trash: false,
        };
        expect(toResolvedEntryCapabilities(cfg).trash).toBe(false);
    });
});

describe('toResolvedEntryCapabilities — versioning', () => {
    it('versioning:true resolves on', () => {
        const cfg: EntryType = {
            type: 'item',
            single: 'Item',
            plural: 'Items',
            versioning: true,
        };
        expect(toResolvedEntryCapabilities(cfg).versioning).toBe(true);
    });

    it('versioning:false resolves off', () => {
        const cfg: EntryType = {
            type: 'item',
            single: 'Item',
            plural: 'Items',
            versioning: false,
        };
        expect(toResolvedEntryCapabilities(cfg).versioning).toBe(false);
    });

    it('versioning object resolves on', () => {
        const cfg: EntryType = {
            type: 'item',
            single: 'Item',
            plural: 'Items',
            versioning: { maxVersions: 10 },
        };
        expect(toResolvedEntryCapabilities(cfg).versioning).toBe(true);
    });
});

describe('toResolvedEntryCapabilities — staging', () => {
    it('staging:true resolves on', () => {
        const cfg: EntryType = {
            type: 'item',
            single: 'Item',
            plural: 'Items',
            staging: true,
        };
        expect(toResolvedEntryCapabilities(cfg).staging).toBe(true);
    });

    it('staging:false resolves off', () => {
        const cfg: EntryType = {
            type: 'item',
            single: 'Item',
            plural: 'Items',
            staging: false,
        };
        expect(toResolvedEntryCapabilities(cfg).staging).toBe(false);
    });

    it('staging is independent of versioning (on without versioning)', () => {
        const cfg: EntryType = {
            type: 'item',
            single: 'Item',
            plural: 'Items',
            staging: true,
            versioning: false,
        };
        const caps = toResolvedEntryCapabilities(cfg);
        expect(caps.staging).toBe(true);
        expect(caps.versioning).toBe(false);
    });
});

describe('assertEntryTypeValid — titleField', () => {
    it("'title' is valid", () => {
        const cfg: EntryType = {
            type: 'item',
            single: 'Item',
            plural: 'Items',
            titleField: 'title',
        };
        expect(() => assertEntryTypeValid('widget', cfg)).not.toThrow();
    });

    it('false is valid', () => {
        const cfg: EntryType = {
            type: 'item',
            single: 'Item',
            plural: 'Items',
            titleField: false,
        };
        expect(() => assertEntryTypeValid('widget', cfg)).not.toThrow();
    });

    it('undefined is valid (defaults to title)', () => {
        const cfg: EntryType = {
            type: 'item',
            single: 'Item',
            plural: 'Items',
        };
        expect(() => assertEntryTypeValid('widget', cfg)).not.toThrow();
    });

    it("'name' throws with descriptive message", () => {
        // The type already restricts `titleField` to 'title' | false | undefined.
        const cfg = invalid<EntryType>({
            type: 'item',
            single: 'Item',
            plural: 'Items',
            titleField: 'name',
        });
        expect(() => assertEntryTypeValid('widget', cfg)).toThrow(
            `Astromech entry type "widget": titleField must be 'title' or false (got "name"). A custom title field name is not supported — a type is either titled on \`title\` or titleless.`
        );
    });
});

describe('assertEntryTypeValid — type', () => {
    const item = (type: string): EntryType => ({ type, single: 'Item', plural: 'Items' });

    it('rejects a type containing "/"', () => {
        expect(() => assertEntryTypeValid('forms/form', item('forms/form'))).toThrow(
            /must not contain "\/" or ":"/
        );
    });

    it('rejects a type containing ":"', () => {
        expect(() => assertEntryTypeValid('post:en', item('post:en'))).toThrow(
            /must not contain "\/" or ":"/
        );
    });

    it('rejects an empty type', () => {
        expect(() => assertEntryTypeValid('', item(''))).toThrow(/non-empty/);
    });
});

describe('resolveEntryTypes', () => {
    const item = (type: string, extra: Partial<EntryType> = {}): EntryType => ({
        type,
        single: 'Item',
        plural: 'Items',
        ...extra,
    });

    it('returns an empty map when nothing is declared', () => {
        expect(resolveEntryTypes({})).toEqual({});
    });

    it('keys the site entry types by their bare type, in declared order', () => {
        const resolved = resolveEntryTypes({ entries: [item('post'), item('page')] });

        expect(Object.keys(resolved)).toEqual(['post', 'page']);
        expect(resolved['page']?.id).toBe('page');
        expect(resolved['page']).not.toHaveProperty('type');
    });

    it('rejects entry types keyed by type, as a config file loaded unchecked can hold', () => {
        const keyed = invalid<EntryType[]>({ post: item('post') });

        expect(() => resolveEntryTypes({ entries: keyed })).toThrow(
            /`entries` is an array of entry types/
        );
    });

    it('rejects a duplicate type, naming both positions', () => {
        expect(() =>
            resolveEntryTypes({
                entries: [item('post'), item('page'), item('post', { single: 'Again' })],
            })
        ).toThrow(
            /the site config declares the entry type "post" twice \(entries\[0\] and entries\[2\]\)/
        );
    });

    it('keys a plugin entry type by <namespace>/<type>, in the same map, owned by the plugin', () => {
        const forms = definePlugin({
            package: '@astromech/forms',
            entries: [item('form')],
        })();

        const resolved = resolveEntryTypes({ entries: [item('form')], plugins: [forms] });

        expect(Object.keys(resolved)).toEqual(['form', 'forms/form']);
        expect(resolved['forms/form']).toMatchObject({
            id: 'forms/form',
            plugin: 'forms',
        });
        expect(resolved['form']?.plugin).toBeUndefined();
    });

    it('rejects a type declared twice within one plugin, naming the package', () => {
        const forms = definePlugin({
            package: '@astromech/forms',
            entries: [item('form'), item('form')],
        })();

        expect(() => resolveEntryTypes({ plugins: [forms] })).toThrow(
            /plugin "@astromech\/forms" declares the entry type "form" twice/
        );
    });

    it('rejects a plugin type holding the qualified separator', () => {
        const forms = definePlugin({
            package: '@astromech/forms',
            entries: [item('forms/form')],
        })();

        expect(() => resolveEntryTypes({ plugins: [forms] })).toThrow(
            /"forms\/forms\/form": type must not contain "\/" or ":"/
        );
    });
});
