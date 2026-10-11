import type { AdminEntryType, ResolvedEntryCapabilities } from '@/types/index';
import { describe, expect, it } from 'vitest';
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
    it('orders columns: title, status, slug, locale, translations, ...adminColumns, updatedAt, updatedBy', () => {
        const table = resolveTable(fullConfig);
        expect(table.type).toBe('Post');
        expect(table.columns.map((c) => c.key)).toEqual([
            'title',
            'status',
            'slug',
            'locale',
            'translations',
            'fields.featured',
            'fields.category',
            'updatedAt',
            'updatedBy',
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
            kind: 'status',
            sortable: true,
            system: true,
            requires: 'statuses',
        });
        expect(byKey.slug).toMatchObject({
            kind: 'slug',
            sortable: true,
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
        expect(byKey.updatedBy).toMatchObject({
            kind: 'author',
            source: 'entry',
            sortable: false,
            system: true,
            requires: null,
        });
    });

    it('derives admin column kinds from field type', () => {
        const table = resolveTable(fullConfig);
        const byKey = Object.fromEntries(table.columns.map((c) => [c.key, c]));

        expect(byKey['fields.featured']).toMatchObject({
            name: 'featured',
            kind: 'boolean',
            label: 'Featured',
            source: 'field',
            system: false,
            requires: null,
        });
        // select field -> default 'text'
        expect(byKey['fields.category']).toMatchObject({
            kind: 'text',
            label: 'category',
        });
    });

    it('omits all system columns when titleless and capabilities off', () => {
        const table = resolveTable(titlelessConfig);
        expect(table.columns.map((c) => c.key)).toEqual([
            'fields.from',
            'fields.to',
            'fields.status',
            'fields.enabled',
            'updatedAt',
            'updatedBy',
        ]);
        const enabled = table.columns.find((c) => c.name === 'enabled');
        expect(enabled?.kind).toBe('boolean');
    });

    it('lets an explicit kind override the field-type default', () => {
        const config: AdminEntryType = {
            ...fullConfig,
            adminColumns: [{ field: 'featured', kind: 'badge' }],
        };
        const table = resolveTable(config);
        const featured = table.columns.find((c) => c.name === 'featured');
        expect(featured?.kind).toBe('badge');
    });

    // A field may share a system column's name (DECISIONS.md, "An entries list
    // sorts by a field's bare name"), so a column over it needs its own key.
    it('keys a column over a field named like a system column apart from it', () => {
        const config: AdminEntryType = {
            ...fullConfig,
            adminColumns: [{ field: 'title' }, { field: 'status' }],
            fields: {
                main: [
                    { name: 'title', type: 'text' },
                    { name: 'status', type: 'select' },
                ],
                sidebar: [],
            },
        };
        const columns = resolveTable(config).columns;

        expect(new Set(columns.map((c) => c.key)).size).toBe(columns.length);
        expect(
            columns
                .filter((c) => c.name === 'title' || c.name === 'status')
                .map((c) => [c.key, c.source])
        ).toEqual([
            ['title', 'entry'],
            ['status', 'entry'],
            ['fields.title', 'field'],
            ['fields.status', 'field'],
        ]);
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

    it('hasSlug follows the slug capability', () => {
        expect(resolveForm({ ...fullConfig, capabilities: caps() }).hasSlug).toBe(true);
        expect(
            resolveForm({ ...fullConfig, capabilities: caps({ slug: false }) }).hasSlug
        ).toBe(false);
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
