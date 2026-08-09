import { describe, expect, it } from 'vitest';
import type { AdminEntryType, ResolvedEntryCapabilities } from '@/types/index';
import { resolveForm, resolveTable } from '@/admin/rendering/resolve';

function caps(
    overrides: Partial<ResolvedEntryCapabilities> = {}
): ResolvedEntryCapabilities {
    return {
        statuses: true,
        slug: true,
        translatable: true,
        versioning: true,
        staging: true,
        trash: true,
        ...overrides,
    };
}

const fullConfig: AdminEntryType = {
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

const titlelessConfig: AdminEntryType = {
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

describe('resolveTable', () => {
    it('orders columns: title, status, slug, locale, translations, ...adminColumns, updatedAt', () => {
        const table = resolveTable(fullConfig);
        expect(table.type).toBe('Post');
        expect(table.columns.map((c) => c.key)).toEqual([
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
        const table = resolveTable(fullConfig);
        const byKey = Object.fromEntries(table.columns.map((c) => [c.key, c]));

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
        const table = resolveTable(fullConfig);
        const byKey = Object.fromEntries(table.columns.map((c) => [c.key, c]));

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
        const table = resolveTable(titlelessConfig);
        expect(table.columns.map((c) => c.key)).toEqual([
            'from',
            'to',
            'status',
            'enabled',
            'updatedAt',
        ]);
        const enabled = table.columns.find((c) => c.key === 'enabled');
        expect(enabled?.kind).toBe('boolean');
    });

    it('lets an explicit kind override the field-type default', () => {
        const config: AdminEntryType = {
            ...fullConfig,
            adminColumns: [{ field: 'featured', kind: 'badge' }],
        };
        const table = resolveTable(config);
        const featured = table.columns.find((c) => c.key === 'featured');
        expect(featured?.kind).toBe('badge');
    });

    it('defaults to text for an admin column not in the field tree (no throw)', () => {
        const config: AdminEntryType = {
            ...fullConfig,
            adminColumns: [{ field: 'orphan' }],
        };
        const table = resolveTable(config);
        const orphan = table.columns.find((c) => c.key === 'orphan');
        expect(orphan?.kind).toBe('text');
    });

    it('produces a JSON-serializable table', () => {
        const table = resolveTable(fullConfig);
        expect(JSON.parse(JSON.stringify(table))).toEqual(table);
    });
});

describe('resolveForm', () => {
    it('returns main and sidebar from the fields shape', () => {
        const form = resolveForm(fullConfig);
        expect(form.type).toBe('Post');
        expect(form.main.map((f) => f.name)).toEqual(['body', 'featured', 'category']);
        expect(form.sidebar.map((f) => f.name)).toEqual(['author']);
    });

    it('reflects title/slug/statuses flags from config', () => {
        const form = resolveForm(fullConfig);
        expect(form.hasTitle).toBe(true);
        expect(form.hasSlug).toBe(true);
        expect(form.hasStatuses).toBe(true);
    });

    it('hasSlug is false when slug capability is on but slug config is null', () => {
        const config: AdminEntryType = { ...fullConfig, slug: null };
        expect(resolveForm(config).hasSlug).toBe(false);
    });

    it('hasSlug is false when slug config is undefined (nullish parity)', () => {
        const config = {
            ...fullConfig,
            slug: undefined,
        } as unknown as AdminEntryType;
        expect(resolveForm(config).hasSlug).toBe(false);
    });

    it('reflects titleless / disabled-capabilities config', () => {
        const form = resolveForm(titlelessConfig);
        expect(form.hasTitle).toBe(false);
        expect(form.hasSlug).toBe(false);
        expect(form.hasStatuses).toBe(false);
    });

    it('sidebar is empty array for a main-only config', () => {
        const form = resolveForm(titlelessConfig);
        expect(form.sidebar).toEqual([]);
    });
});
