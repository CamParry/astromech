import type { EntryType } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { assertEntryTypeValid, toResolvedEntryCapabilities } from '@/config/entry-types';

describe('toResolvedEntryCapabilities — defaults', () => {
    const emptyCfg: EntryType = {
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
            single: 'Item',
            plural: 'Items',
            statuses: false,
        };
        expect(toResolvedEntryCapabilities(cfg).statuses).toBe(false);
    });

    it('slug:false resolves off', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            slug: false,
        };
        expect(toResolvedEntryCapabilities(cfg).slug).toBe(false);
    });

    it('trash:false resolves off', () => {
        const cfg: EntryType = {
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
            single: 'Item',
            plural: 'Items',
            versioning: true,
        };
        expect(toResolvedEntryCapabilities(cfg).versioning).toBe(true);
    });

    it('versioning:false resolves off', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            versioning: false,
        };
        expect(toResolvedEntryCapabilities(cfg).versioning).toBe(false);
    });

    it('versioning object resolves on', () => {
        const cfg: EntryType = {
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
            single: 'Item',
            plural: 'Items',
            staging: true,
        };
        expect(toResolvedEntryCapabilities(cfg).staging).toBe(true);
    });

    it('staging:false resolves off', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            staging: false,
        };
        expect(toResolvedEntryCapabilities(cfg).staging).toBe(false);
    });

    it('staging is independent of versioning (on without versioning)', () => {
        const cfg: EntryType = {
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
            single: 'Item',
            plural: 'Items',
            titleField: 'title',
        };
        expect(() => assertEntryTypeValid('widget', cfg)).not.toThrow();
    });

    it('false is valid', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            titleField: false,
        };
        expect(() => assertEntryTypeValid('widget', cfg)).not.toThrow();
    });

    it('undefined is valid (defaults to title)', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
        };
        expect(() => assertEntryTypeValid('widget', cfg)).not.toThrow();
    });

    it("'name' throws with descriptive message", () => {
        // Cast needed because the type already restricts to 'title' | false | undefined.
        const cfg = {
            single: 'Item',
            plural: 'Items',
            titleField: 'name',
        } as unknown as EntryType;
        expect(() => assertEntryTypeValid('widget', cfg)).toThrow(
            `Astromech entry type "widget": titleField must be 'title' or false (got "name"). A custom title field name is not supported — a type is either titled on \`title\` or titleless.`
        );
    });
});
