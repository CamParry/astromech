/**
 * Which fields an entries list orders by: the field types that sort, the names
 * a list over several types shares, `entries.query` passing them to the
 * repository, and config resolve refusing an admin column on no declared
 * field, or a sortable one the list would refuse.
 */

import type { AdminColumn } from '@/types/index';
import {
    createTestDb,
    getEntryType,
    makeTestConfig,
    setupTestConfig,
    withEntryTypes,
} from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { toResolvedFields } from '@/config/entry-types';
import { resolveConfig } from '@/config/resolve';
import { sharedSortableFields, sortableFieldNames } from '@/entries/sort-fields';
import * as fields from '@/fields/builder';
import * as columns from '@/fields/columns';

const api = currentServices.entries;

describe('sortableFieldNames', () => {
    it('keeps top-level fields whose type stores one value, through layout fields', () => {
        const names = sortableFieldNames(
            toResolvedFields({
                main: [
                    fields.text('name'),
                    fields.number('price'),
                    fields.tabs({
                        fields: [
                            fields.tab({
                                label: 'More',
                                fields: [
                                    fields.date('released'),
                                    fields.boolean('featured'),
                                ],
                            }),
                        ],
                    }),
                    fields.repeater('items', { fields: [fields.text('label')] }),
                    fields.group('meta', { fields: [fields.text('note')] }),
                    fields.relationship('related', { target: 'post' }),
                    fields.richtext('body'),
                    fields.multiselect('tags', { options: ['a'] }),
                ],
                sidebar: [fields.select('tone', { options: ['calm'] })],
            }),
            'full'
        );
        expect(names).toEqual(['name', 'price', 'released', 'featured', 'tone']);
    });

    it('leaves out a field named like a system column', () => {
        const names = sortableFieldNames(
            toResolvedFields([
                fields.text('title'),
                fields.text('slug'),
                fields.text('kept'),
            ]),
            'full'
        );
        expect(names).toEqual(['kept']);
    });

    it('leaves out a private field from a public read only', () => {
        const declared = toResolvedFields([
            fields.text('open'),
            fields.text('secret', { private: true }),
        ]);
        expect(sortableFieldNames(declared, 'full')).toEqual(['open', 'secret']);
        expect(sortableFieldNames(declared, 'public')).toEqual(['open']);
    });
});

describe('sharedSortableFields', () => {
    it('keeps the fields every queried type declares as sortable', () => {
        const config = resolveConfig(makeTestConfig());
        // post declares body and category; note only body.
        expect(sharedSortableFields(config, ['post'], 'full')).toEqual([
            'body',
            'category',
        ]);
        expect(sharedSortableFields(config, ['post', 'note'], 'full')).toEqual(['body']);
        expect(sharedSortableFields(config, ['post', 'missing'], 'full')).toEqual([]);
    });
});

describe('entries.query sorted by a field', () => {
    beforeEach(async () => {
        await createTestDb();
        setupTestConfig();
    });

    it('orders by a field the type declares', async () => {
        for (const category of ['b', 'c', 'a']) {
            await api.create({
                type: 'post',
                data: { title: category, fields: { category } },
            });
        }
        const asc = await api.query({
            type: 'post',
            full: true,
            sort: { category: 'asc' },
        });
        expect(asc.data.map((entry) => entry.fields['category'])).toEqual([
            'a',
            'b',
            'c',
        ]);
        const desc = await api.query({
            type: 'post',
            full: true,
            sort: { category: 'desc' },
        });
        expect(desc.data.map((entry) => entry.fields['category'])).toEqual([
            'c',
            'b',
            'a',
        ]);
    });

    // Written with an offset, in UTC, as a bare date and as a wall time, the
    // values sort as text only once each is stored in one ISO form.
    it('orders a datetime field in time order, whatever form each value was written in', async () => {
        const config = makeTestConfig();
        getEntryType(config, 'note').fields = [fields.datetime('startsAt')];
        setupTestConfig(config);
        for (const [title, startsAt] of [
            ['offset', '2026-10-10T11:00:00+02:00'],
            ['utc', '2026-10-10T08:30:00Z'],
            ['date only', '2026-10-10'],
            ['wall time', '2026-10-10T10:00'],
        ] as const) {
            await api.create({ type: 'note', data: { title, fields: { startsAt } } });
        }

        const rows = await api.query({
            type: 'note',
            full: true,
            sort: { startsAt: 'asc' },
        });

        expect(rows.data.map((entry) => [entry.title, entry.fields['startsAt']])).toEqual(
            [
                ['date only', '2026-10-10'],
                ['utc', '2026-10-10T08:30:00.000Z'],
                ['offset', '2026-10-10T09:00:00.000Z'],
                ['wall time', '2026-10-10T10:00'],
            ]
        );
    });

    it('orders a date field in time order', async () => {
        const config = makeTestConfig();
        getEntryType(config, 'note').fields = [fields.date('day')];
        setupTestConfig(config);
        for (const day of ['2026-10-10', '2025-12-31', '2026-01-02']) {
            await api.create({ type: 'note', data: { title: day, fields: { day } } });
        }

        const rows = await api.query({ type: 'note', full: true, sort: { day: 'desc' } });

        expect(rows.data.map((entry) => entry.fields['day'])).toEqual([
            '2026-10-10',
            '2026-01-02',
            '2025-12-31',
        ]);
    });

    it('orders a list over several types by a field every type declares', async () => {
        await api.create({ type: 'post', data: { title: 'P', fields: { body: 'b' } } });
        await api.create({ type: 'note', data: { title: 'N', fields: { body: 'a' } } });
        const rows = await api.query({
            type: ['post', 'note'],
            full: true,
            sort: { body: 'asc' },
        });
        expect(rows.data.map((entry) => entry.title)).toEqual(['N', 'P']);
    });

    it('refuses a field one of several types lacks, naming the fields that work', async () => {
        await expect(
            api.query({ type: ['post', 'note'], full: true, sort: { category: 'asc' } })
        ).rejects.toMatchObject({
            name: 'UnknownSortKeyError',
            status: 400,
            message: expect.stringMatching(/'category'.*'slug', 'body'\.$/),
        });
    });

    it('refuses a field that holds no single value, and an unknown name', async () => {
        for (const key of ['related', 'nope']) {
            await expect(
                api.query({ type: 'post', full: true, sort: { [key]: 'asc' } })
            ).rejects.toMatchObject({ name: 'UnknownSortKeyError', key });
        }
    });

    it('refuses a private field in a public read', async () => {
        const config = makeTestConfig();
        getEntryType(config, 'note').fields = [
            fields.text('body'),
            fields.text('secret', { private: true }),
        ];
        setupTestConfig(config);
        await expect(
            api.query({ type: 'note', sort: { secret: 'asc' } })
        ).rejects.toMatchObject({ name: 'UnknownSortKeyError', key: 'secret' });
        await expect(
            api.query({ type: 'note', full: true, sort: { secret: 'asc' } })
        ).resolves.toMatchObject({ data: [] });
    });
});

describe('an admin column at config resolve', () => {
    function resolveWith(adminColumns: AdminColumn[]): () => void {
        const config = makeTestConfig();
        config.entries = withEntryTypes(config.entries, {
            type: 'post',
            single: 'Post',
            plural: 'Posts',
            fields: [
                fields.number('price'),
                fields.text('title'),
                fields.repeater('items', { fields: [fields.text('label')] }),
                fields.relationship('related', { target: 'post' }),
            ],
            adminColumns,
        });
        return () => resolveConfig(config);
    }

    it('accepts a sortable column on a field that sorts, and any unsorted column', () => {
        expect(
            resolveWith([
                columns.number('price', { sortable: true }),
                columns.text('items'),
                columns.text('title'),
            ])
        ).not.toThrow();
    });

    it.each([
        ['an unsorted', columns.text('slug')],
        ['a sortable', columns.text('unknown', { sortable: true })],
    ])('refuses %s column on a field the type does not declare', (_, column) => {
        expect(resolveWith([column])).toThrow(
            new RegExp(
                `admin column "${column.field}" shows a field, but the type declares no ` +
                    'top-level field by that name.*Fields: "price", "title", "items", "related"'
            )
        );
    });

    it.each([
        [
            'items',
            /admin column "items" is sortable.*`repeater` field holds no single value/,
        ],
        [
            'related',
            /`relationship` field holds no single value.*Sortable fields: "price"/,
        ],
        ['title', /a sort by "title" orders by the entry's own `title` column/],
    ])('refuses a sortable column on %s', (field, message) => {
        expect(resolveWith([columns.text(field, { sortable: true })])).toThrow(message);
    });
});
