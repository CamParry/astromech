import { describe, expect, it } from 'vitest';
import type { EntryTypeConfig } from '@/types/index.js';
import {
    BUILT_IN_SUPPORTS,
    resolveEntryCapabilities,
    assertEntryTypeValid,
} from '@/entries/storage/capabilities.js';

// ============================================================================
// resolveEntryCapabilities — defaults
// ============================================================================

describe('resolveEntryCapabilities — defaults', () => {
    const emptyCfg: EntryTypeConfig = {
        single: 'Item',
        plural: 'Items',
    };

    it('statuses defaults ON with built-in storage', () => {
        const caps = resolveEntryCapabilities(emptyCfg, BUILT_IN_SUPPORTS);
        expect(caps.statuses).toBe(true);
    });

    it('slug defaults ON with built-in storage', () => {
        const caps = resolveEntryCapabilities(emptyCfg, BUILT_IN_SUPPORTS);
        expect(caps.slug).toBe(true);
    });

    it('trash defaults ON with built-in storage', () => {
        const caps = resolveEntryCapabilities(emptyCfg, BUILT_IN_SUPPORTS);
        expect(caps.trash).toBe(true);
    });

    it('versioning defaults OFF', () => {
        const caps = resolveEntryCapabilities(emptyCfg, BUILT_IN_SUPPORTS);
        expect(caps.versioning).toBe(false);
    });

    it('translatable defaults OFF', () => {
        const caps = resolveEntryCapabilities(emptyCfg, BUILT_IN_SUPPORTS);
        expect(caps.translatable).toBe(false);
    });

    it('staging defaults OFF', () => {
        const caps = resolveEntryCapabilities(emptyCfg, BUILT_IN_SUPPORTS);
        expect(caps.staging).toBe(false);
    });
});

// ============================================================================
// resolveEntryCapabilities — explicit opt-outs
// ============================================================================

describe('resolveEntryCapabilities — explicit opt-outs', () => {
    it('statuses:false resolves off', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            statuses: false,
        };
        expect(resolveEntryCapabilities(cfg, BUILT_IN_SUPPORTS).statuses).toBe(false);
    });

    it('slug:false resolves off', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            slug: false,
        };
        expect(resolveEntryCapabilities(cfg, BUILT_IN_SUPPORTS).slug).toBe(false);
    });

    it('trash:false resolves off', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            trash: false,
        };
        expect(resolveEntryCapabilities(cfg, BUILT_IN_SUPPORTS).trash).toBe(false);
    });
});

// ============================================================================
// resolveEntryCapabilities — versioning boolean + object forms
// ============================================================================

describe('resolveEntryCapabilities — versioning', () => {
    it('versioning:true resolves on', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            versioning: true,
        };
        expect(resolveEntryCapabilities(cfg, BUILT_IN_SUPPORTS).versioning).toBe(true);
    });

    it('versioning:false resolves off', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            versioning: false,
        };
        expect(resolveEntryCapabilities(cfg, BUILT_IN_SUPPORTS).versioning).toBe(false);
    });

    it('versioning object resolves on', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            versioning: { maxVersions: 10 },
        };
        expect(resolveEntryCapabilities(cfg, BUILT_IN_SUPPORTS).versioning).toBe(true);
    });
});

// ============================================================================
// resolveEntryCapabilities — staging (independent of versioning)
// ============================================================================

describe('resolveEntryCapabilities — staging', () => {
    it('staging:true resolves on with built-in storage', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            staging: true,
        };
        expect(resolveEntryCapabilities(cfg, BUILT_IN_SUPPORTS).staging).toBe(true);
    });

    it('staging:false resolves off', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            staging: false,
        };
        expect(resolveEntryCapabilities(cfg, BUILT_IN_SUPPORTS).staging).toBe(false);
    });

    it('staging is independent of versioning (on without versioning)', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            staging: true,
            versioning: false,
        };
        const caps = resolveEntryCapabilities(cfg, BUILT_IN_SUPPORTS);
        expect(caps.staging).toBe(true);
        expect(caps.versioning).toBe(false);
    });

    it('staging resolves off when storage does not support it', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            staging: true,
        };
        expect(resolveEntryCapabilities(cfg, ['statuses']).staging).toBe(false);
    });

    it('assertEntryTypeValid throws when staging is requested but unsupported', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            staging: true,
        };
        const caps = resolveEntryCapabilities(cfg, []);
        expect(() => assertEntryTypeValid('widget', cfg, caps, [])).toThrow(/staging/);
    });
});

// ============================================================================
// resolveEntryCapabilities — narrower storageSupports
// ============================================================================

describe('resolveEntryCapabilities — narrower storageSupports', () => {
    const emptyCfg: EntryTypeConfig = {
        single: 'Item',
        plural: 'Items',
    };

    it('unrequested capabilities default off when not in storageSupports', () => {
        const caps = resolveEntryCapabilities(emptyCfg, []);
        expect(caps.statuses).toBe(false);
        expect(caps.slug).toBe(false);
        expect(caps.trash).toBe(false);
        expect(caps.versioning).toBe(false);
        expect(caps.translatable).toBe(false);
    });

    it('partial supports: only supported capabilities use their defaults', () => {
        const caps = resolveEntryCapabilities(emptyCfg, ['statuses']);
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
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            versioning: true,
            trash: true,
        };
        const caps = resolveEntryCapabilities(cfg, []);
        expect(() => assertEntryTypeValid('widget', cfg, caps, [])).toThrow(
            'Astromech entry type "widget" declares capabilities its storage does not support: trash, versioning. Storage supports: (none).'
        );
    });

    it('includes the storage support list in the message when non-empty', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            versioning: true,
        };
        const narrowSupports = ['statuses'] as const;
        const caps = resolveEntryCapabilities(cfg, narrowSupports);
        expect(() => assertEntryTypeValid('widget', cfg, caps, narrowSupports)).toThrow(
            'Storage supports: statuses.'
        );
    });

    it('does not throw when all requested capabilities are supported', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            versioning: true,
            translatable: true,
        };
        const caps = resolveEntryCapabilities(cfg, BUILT_IN_SUPPORTS);
        expect(() =>
            assertEntryTypeValid('widget', cfg, caps, BUILT_IN_SUPPORTS)
        ).not.toThrow();
    });
});

// ============================================================================
// assertEntryTypeValid — titleField validation
// ============================================================================

describe('assertEntryTypeValid — titleField', () => {
    const caps = resolveEntryCapabilities(
        { single: 'Item', plural: 'Items' },
        BUILT_IN_SUPPORTS
    );

    it("'title' is valid", () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            titleField: 'title',
        };
        expect(() =>
            assertEntryTypeValid('widget', cfg, caps, BUILT_IN_SUPPORTS)
        ).not.toThrow();
    });

    it('false is valid', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
            titleField: false,
        };
        expect(() =>
            assertEntryTypeValid('widget', cfg, caps, BUILT_IN_SUPPORTS)
        ).not.toThrow();
    });

    it('undefined is valid (defaults to title)', () => {
        const cfg: EntryTypeConfig = {
            single: 'Item',
            plural: 'Items',
        };
        expect(() =>
            assertEntryTypeValid('widget', cfg, caps, BUILT_IN_SUPPORTS)
        ).not.toThrow();
    });

    it("'name' throws with descriptive message", () => {
        // Cast needed because the type already restricts to 'title' | false | undefined.
        const cfg = {
            single: 'Item',
            plural: 'Items',
            titleField: 'name',
        } as unknown as EntryTypeConfig;
        expect(() =>
            assertEntryTypeValid('widget', cfg, caps, BUILT_IN_SUPPORTS)
        ).toThrow(
            `Astromech entry type "widget": titleField must be 'title' or false for built-in storage (got "name"). Custom title fields arrive with custom storage.`
        );
    });
});
