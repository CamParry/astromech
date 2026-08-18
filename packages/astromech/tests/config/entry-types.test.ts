import { describe, expect, it } from 'vitest';
import type { EntryType } from '@/types/index';
import { BUILT_IN_SUPPORTS } from '@/utilities/entry-capabilities';
import { toResolvedEntryCapabilities, assertEntryTypeValid } from '@/config/entry-types';

// ============================================================================
// toResolvedEntryCapabilities — defaults
// ============================================================================

describe('toResolvedEntryCapabilities — defaults', () => {
    const emptyCfg: EntryType = {
        single: 'Item',
        plural: 'Items',
    };

    it('statuses defaults ON with built-in storage', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg, BUILT_IN_SUPPORTS);
        expect(caps.statuses).toBe(true);
    });

    it('slug defaults ON with built-in storage', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg, BUILT_IN_SUPPORTS);
        expect(caps.slug).toBe(true);
    });

    it('trash defaults ON with built-in storage', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg, BUILT_IN_SUPPORTS);
        expect(caps.trash).toBe(true);
    });

    it('versioning defaults OFF', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg, BUILT_IN_SUPPORTS);
        expect(caps.versioning).toBe(false);
    });

    it('translatable defaults OFF', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg, BUILT_IN_SUPPORTS);
        expect(caps.translatable).toBe(false);
    });

    it('staging defaults OFF', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg, BUILT_IN_SUPPORTS);
        expect(caps.staging).toBe(false);
    });
});

// ============================================================================
// toResolvedEntryCapabilities — explicit opt-outs
// ============================================================================

describe('toResolvedEntryCapabilities — explicit opt-outs', () => {
    it('statuses:false resolves off', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            statuses: false,
        };
        expect(toResolvedEntryCapabilities(cfg, BUILT_IN_SUPPORTS).statuses).toBe(false);
    });

    it('slug:false resolves off', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            slug: false,
        };
        expect(toResolvedEntryCapabilities(cfg, BUILT_IN_SUPPORTS).slug).toBe(false);
    });

    it('trash:false resolves off', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            trash: false,
        };
        expect(toResolvedEntryCapabilities(cfg, BUILT_IN_SUPPORTS).trash).toBe(false);
    });
});

// ============================================================================
// toResolvedEntryCapabilities — versioning boolean + object forms
// ============================================================================

describe('toResolvedEntryCapabilities — versioning', () => {
    it('versioning:true resolves on', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            versioning: true,
        };
        expect(toResolvedEntryCapabilities(cfg, BUILT_IN_SUPPORTS).versioning).toBe(true);
    });

    it('versioning:false resolves off', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            versioning: false,
        };
        expect(toResolvedEntryCapabilities(cfg, BUILT_IN_SUPPORTS).versioning).toBe(
            false
        );
    });

    it('versioning object resolves on', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            versioning: { maxVersions: 10 },
        };
        expect(toResolvedEntryCapabilities(cfg, BUILT_IN_SUPPORTS).versioning).toBe(true);
    });
});

// ============================================================================
// toResolvedEntryCapabilities — staging (independent of versioning)
// ============================================================================

describe('toResolvedEntryCapabilities — staging', () => {
    it('staging:true resolves on with built-in storage', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            staging: true,
        };
        expect(toResolvedEntryCapabilities(cfg, BUILT_IN_SUPPORTS).staging).toBe(true);
    });

    it('staging:false resolves off', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            staging: false,
        };
        expect(toResolvedEntryCapabilities(cfg, BUILT_IN_SUPPORTS).staging).toBe(false);
    });

    it('staging is independent of versioning (on without versioning)', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            staging: true,
            versioning: false,
        };
        const caps = toResolvedEntryCapabilities(cfg, BUILT_IN_SUPPORTS);
        expect(caps.staging).toBe(true);
        expect(caps.versioning).toBe(false);
    });

    it('staging resolves off when storage does not support it', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            staging: true,
        };
        expect(toResolvedEntryCapabilities(cfg, ['statuses']).staging).toBe(false);
    });

    it('assertEntryTypeValid throws when staging is requested but unsupported', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            staging: true,
        };
        expect(() => assertEntryTypeValid('widget', cfg, [])).toThrow(/staging/);
    });
});

// ============================================================================
// toResolvedEntryCapabilities — narrower storageSupports
// ============================================================================

describe('toResolvedEntryCapabilities — narrower storageSupports', () => {
    const emptyCfg: EntryType = {
        single: 'Item',
        plural: 'Items',
    };

    it('unrequested capabilities default off when not in storageSupports', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg, []);
        expect(caps.statuses).toBe(false);
        expect(caps.slug).toBe(false);
        expect(caps.trash).toBe(false);
        expect(caps.versioning).toBe(false);
        expect(caps.translatable).toBe(false);
    });

    it('partial supports: only supported capabilities use their defaults', () => {
        const caps = toResolvedEntryCapabilities(emptyCfg, ['statuses']);
        expect(caps.statuses).toBe(true);
        expect(caps.slug).toBe(false);
        expect(caps.trash).toBe(false);
    });
});

// ============================================================================
// assertEntryTypeValid — capability mismatch throws
// ============================================================================

describe('assertEntryTypeValid — capability mismatch', () => {
    it('throws when explicitly-requested capability is unsupported', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            versioning: true,
            trash: true,
        };
        expect(() => assertEntryTypeValid('widget', cfg, [])).toThrow(
            'Astromech entry type "widget" declares capabilities its storage does not support: trash, versioning. Storage supports: (none).'
        );
    });

    it('includes the storage support list in the message when non-empty', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            versioning: true,
        };
        expect(() => assertEntryTypeValid('widget', cfg, ['statuses'])).toThrow(
            'Storage supports: statuses.'
        );
    });

    it('does not throw when all requested capabilities are supported', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            versioning: true,
            translatable: true,
        };
        expect(() =>
            assertEntryTypeValid('widget', cfg, BUILT_IN_SUPPORTS)
        ).not.toThrow();
    });
});

// ============================================================================
// assertEntryTypeValid — titleField validation
// ============================================================================

describe('assertEntryTypeValid — titleField', () => {
    it("'title' is valid", () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            titleField: 'title',
        };
        expect(() =>
            assertEntryTypeValid('widget', cfg, BUILT_IN_SUPPORTS)
        ).not.toThrow();
    });

    it('false is valid', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
            titleField: false,
        };
        expect(() =>
            assertEntryTypeValid('widget', cfg, BUILT_IN_SUPPORTS)
        ).not.toThrow();
    });

    it('undefined is valid (defaults to title)', () => {
        const cfg: EntryType = {
            single: 'Item',
            plural: 'Items',
        };
        expect(() =>
            assertEntryTypeValid('widget', cfg, BUILT_IN_SUPPORTS)
        ).not.toThrow();
    });

    it("'name' throws with descriptive message", () => {
        // Cast needed because the type already restricts to 'title' | false | undefined.
        const cfg = {
            single: 'Item',
            plural: 'Items',
            titleField: 'name',
        } as unknown as EntryType;
        expect(() => assertEntryTypeValid('widget', cfg, BUILT_IN_SUPPORTS)).toThrow(
            `Astromech entry type "widget": titleField must be 'title' or false (got "name"). A custom title field name is not supported — a type is either titled on \`title\` or titleless.`
        );
    });

    it('rejects a custom title field even with custom storage', () => {
        const cfg = {
            single: 'Item',
            plural: 'Items',
            titleField: 'name',
        } as unknown as EntryType;
        expect(() => assertEntryTypeValid('widget', cfg, ['statuses'])).toThrow(
            /titleField must be 'title' or false/
        );
    });
});
