import { describe, expect, it } from 'vitest';
import type { AdminEntryTypeConfig, ResolvedEntryCapabilities } from '@/types/index.js';
import {
    deriveFormDefinition,
    deriveTableDefinition,
} from '@/admin/definitions/derive.js';

function caps(
    overrides: Partial<ResolvedEntryCapabilities> = {}
): ResolvedEntryCapabilities {
    return {
        statuses: true,
        slug: true,
        translatable: true,
        versioning: true,
        trash: true,
        ...overrides,
    };
}

const fullConfig: AdminEntryTypeConfig = {
    single: 'Post',
    plural: 'Posts',
    versioning: true,
    translatable: true,
    slug: { source: 'title' },
    adminColumns: [{ field: 'featured', label: 'Featured' }, { field: 'category' }],
    fields: {
        main: [
            { name: 'body', type: 'richtext' },
            { name: 'featured', type: 'boolean' },
            { name: 'category', type: 'select' },
        ],
        sidebar: [{ name: 'author', type: 'text' }],
    },
    url: null,
    capabilities: caps(),
    titleField: 'title',
};

const titlelessConfig: AdminEntryTypeConfig = {
    single: 'Redirect',
    plural: 'Redirects',
    versioning: false,
    translatable: false,
    slug: null,
    adminColumns: [
        { field: 'from' },
        { field: 'to' },
        { field: 'status' },
        { field: 'enabled' },
    ],
    fields: {
        main: [
            { name: 'from', type: 'text' },
            { name: 'to', type: 'url' },
            { name: 'status', type: 'select' },
            { name: 'enabled', type: 'boolean' },
        ],
        sidebar: [],
    },
    url: null,
    capabilities: caps({
        statuses: false,
        slug: false,
        translatable: false,
        versioning: false,
    }),
    titleField: false,
};

describe('deriveTableDefinition', () => {
    it('orders columns: title, status, slug, locale, translations, ...adminColumns, updatedAt', () => {
        const def = deriveTableDefinition(fullConfig);
        expect(def.type).toBe('Post');
        expect(def.columns.map((c) => c.key)).toEqual([
            'title',
            'status',
            'slug',
            'locale',
            'translations',
            'featured',
            'category',
            'updatedAt',
        ]);
    });

    it('derives system column kind/requires/sortable correctly', () => {
        const def = deriveTableDefinition(fullConfig);
        const byKey = Object.fromEntries(def.columns.map((c) => [c.key, c]));

        expect(byKey.title).toMatchObject({
            kind: 'title',
            source: 'entry',
            sortable: true,
            system: true,
            requires: 'title',
        });
        expect(byKey.status).toMatchObject({
            kind: 'badge',
            sortable: false,
            system: true,
            requires: 'statuses',
        });
        expect(byKey.slug).toMatchObject({
            kind: 'slug',
            sortable: false,
            system: true,
            requires: 'slug',
        });
        expect(byKey.locale).toMatchObject({
            kind: 'locale',
            sortable: false,
            system: true,
            requires: 'locale',
        });
        expect(byKey.translations).toMatchObject({
            kind: 'translations',
            sortable: false,
            system: true,
            requires: 'translatable',
        });
        expect(byKey.updatedAt).toMatchObject({
            kind: 'date',
            sortable: true,
            system: true,
            requires: null,
        });
    });

    it('derives admin column kinds from field type', () => {
        const def = deriveTableDefinition(fullConfig);
        const byKey = Object.fromEntries(def.columns.map((c) => [c.key, c]));

        expect(byKey.featured).toMatchObject({
            kind: 'boolean',
            label: 'Featured',
            source: 'field',
            system: false,
            requires: null,
        });
        // select field -> default 'text'
        expect(byKey.category).toMatchObject({ kind: 'text', label: 'category' });
    });

    it('omits all system columns when titleless and capabilities off', () => {
        const def = deriveTableDefinition(titlelessConfig);
        expect(def.columns.map((c) => c.key)).toEqual([
            'from',
            'to',
            'status',
            'enabled',
            'updatedAt',
        ]);
        const enabled = def.columns.find((c) => c.key === 'enabled');
        expect(enabled?.kind).toBe('boolean');
    });

    it('lets an explicit kind override the field-type default', () => {
        const config: AdminEntryTypeConfig = {
            ...fullConfig,
            adminColumns: [{ field: 'featured', kind: 'badge' }],
        };
        const def = deriveTableDefinition(config);
        const featured = def.columns.find((c) => c.key === 'featured');
        expect(featured?.kind).toBe('badge');
    });

    it('defaults to text for an admin column not in the field tree (no throw)', () => {
        const config: AdminEntryTypeConfig = {
            ...fullConfig,
            adminColumns: [{ field: 'orphan' }],
        };
        const def = deriveTableDefinition(config);
        const orphan = def.columns.find((c) => c.key === 'orphan');
        expect(orphan?.kind).toBe('text');
    });

    it('produces a JSON-serializable definition', () => {
        const def = deriveTableDefinition(fullConfig);
        expect(JSON.parse(JSON.stringify(def))).toEqual(def);
    });
});

describe('deriveFormDefinition', () => {
    it('returns main and sidebar from the fields shape', () => {
        const def = deriveFormDefinition(fullConfig);
        expect(def.type).toBe('Post');
        expect(def.main.map((f) => f.name)).toEqual(['body', 'featured', 'category']);
        expect(def.sidebar.map((f) => f.name)).toEqual(['author']);
    });

    it('reflects title/slug/statuses flags from config', () => {
        const def = deriveFormDefinition(fullConfig);
        expect(def.hasTitle).toBe(true);
        expect(def.hasSlug).toBe(true);
        expect(def.hasStatuses).toBe(true);
    });

    it('hasSlug is false when slug capability is on but slug config is null', () => {
        const config: AdminEntryTypeConfig = { ...fullConfig, slug: null };
        expect(deriveFormDefinition(config).hasSlug).toBe(false);
    });

    it('hasSlug is false when slug config is undefined (nullish parity)', () => {
        const config = {
            ...fullConfig,
            slug: undefined,
        } as unknown as AdminEntryTypeConfig;
        expect(deriveFormDefinition(config).hasSlug).toBe(false);
    });

    it('reflects titleless / disabled-capabilities config', () => {
        const def = deriveFormDefinition(titlelessConfig);
        expect(def.hasTitle).toBe(false);
        expect(def.hasSlug).toBe(false);
        expect(def.hasStatuses).toBe(false);
    });

    it('sidebar is empty array for a main-only config', () => {
        const def = deriveFormDefinition(titlelessConfig);
        expect(def.sidebar).toEqual([]);
    });
});
