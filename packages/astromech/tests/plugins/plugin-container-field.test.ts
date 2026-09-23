/**
 * A plugin container field type is carried through every walk over fields
 * with no walker edited: parsing, codegen, public reads, references, config
 * validation and the relationships index. The guard for field-tree traversal.
 */

import type {
    AstromechConfig,
    ContainerScope,
    JsonObject,
    PluginFieldType,
} from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService as api } from '@/app-context/services';
import { generateClientTypes } from '@/codegen/type-generator';
import { resolveConfig } from '@/config/resolve';
import { applyVisibility } from '@/content/visibility';
import { relationship, tab, tabs, text } from '@/fields/builder';
import { flattenEntryFields } from '@/fields/flatten';
import { safeParseFields } from '@/fields/parse-fields';
import { collectRelationshipSchemaPaths, findReferences } from '@/fields/references';

/** A list of cards: an array container no core code knows by name. */
const cardList: PluginFieldType = {
    type: 'acme-card-list',
    component: './card-list.tsx',
    defaultValue: [],
    tsType: (field, _shape, emit) => {
        const lines = ['_id: string;', ...emit.properties(field.fields ?? [])];
        return `Array<{ ${lines.join(' ')} }>`;
    },
    validate: async ({ value }) => (Array.isArray(value) ? true : 'Must be a list'),
    children: (field, value) => {
        const scopes: ContainerScope[] = [];
        const next = (Array.isArray(value) ? value : []).map((raw) => {
            const item = { ...(raw as Record<string, unknown>) };
            const id =
                typeof item['_id'] === 'string' ? item['_id'] : crypto.randomUUID();
            item['_id'] = id;
            scopes.push({
                segments: [
                    { kind: 'field', name: field.name },
                    { kind: 'item', id },
                ],
                definitions: field.fields ?? [],
                values: item,
            });
            return item;
        });
        return { next, scopes };
    },
    subFields: (field) => [{ fields: field.fields ?? [], repeats: true }],
};

const cardsField = {
    name: 'cards',
    type: 'acme-card-list',
    fields: [
        text('heading', { required: true }),
        text('note', { private: true }),
        relationship('link', { target: 'post' }),
    ],
};

function configWithCards(): AstromechConfig {
    const config = makeTestConfig();
    return {
        ...config,
        entries: {
            ...config.entries,
            showcase: { single: 'Showcase', plural: 'Showcases', fields: [cardsField] },
        },
        plugins: [{ package: '@acme/cards', fields: [cardList] }],
    };
}

const parseContext = {
    operation: 'create' as const,
    resource: { kind: 'entry' as const, record: {} },
    user: null,
    isUnique: async () => true,
};

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(configWithCards());
});

describe('a plugin container field type', () => {
    it('is parsed: its items get ids and their fields are validated', async () => {
        const { values, errors } = await safeParseFields(
            { cards: [{ _id: 'c1', heading: '' }, { heading: 'Kept' }] },
            [cardsField],
            parseContext
        );

        expect(errors).toEqual({ 'cards[c1].heading': ['This field is required'] });
        const cards = values['cards'] as JsonObject[];
        expect(cards[1]?.['_id']).toEqual(expect.any(String));
    });

    it('is typed by codegen through its own tsType', () => {
        const output = generateClientTypes(setupTestConfig(configWithCards()));

        expect(output).toContain(
            'cards?: Array<{ _id: string; heading: string; note?: string; link?: string; }>;'
        );
        // The public shape drops the private field inside the container.
        expect(output).toContain(
            'cards?: Array<{ _id: string; heading: string; link?: string; }>;'
        );
    });

    it('loses its private fields on a public read', () => {
        const record = {
            fields: { cards: [{ _id: 'c1', heading: 'Hi', note: 'internal' }] },
            status: 'published' as const,
        };

        const visible = applyVisibility(record, {
            shape: 'public',
            fields: [cardsField],
            audience: { role: null, now: new Date() },
        });

        expect(visible?.fields).toEqual({ cards: [{ _id: 'c1', heading: 'Hi' }] });
    });

    it('declares and yields its references', () => {
        expect(collectRelationshipSchemaPaths([cardsField])).toEqual(['cards[].link']);
        expect(
            findReferences([cardsField], { cards: [{ _id: 'c1', link: 'p1' }] })
        ).toEqual([
            {
                schemaPath: 'cards[].link',
                instancePath: 'cards[c1].link',
                targetId: 'p1',
                targetKind: 'entry',
            },
        ]);
    });

    it('is walked by config validation', () => {
        const misplaced = {
            ...cardsField,
            fields: [tabs({ fields: [tab({ label: 'A', fields: [text('a')] })] })],
        };
        const config = configWithCards();
        expect(() =>
            resolveConfig({
                ...config,
                entries: {
                    ...config.entries,
                    showcase: { single: 'S', plural: 'Ss', fields: [misplaced] },
                },
            })
        ).toThrow(/`tabs` cannot sit inside a `acme-card-list`/);
    });

    it('feeds the relationships index on an entry write', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const source = await api.create({
            type: 'showcase',
            data: {
                title: 'Cards',
                fields: { cards: [{ heading: 'One', link: target.id }] },
            },
        });

        const incoming = await api.usedBy({ type: 'post', id: target.id });

        expect(incoming).toEqual([
            expect.objectContaining({ sourceId: source.id, schemaPath: 'cards[].link' }),
        ]);
    });

    it('keeps its fields flattened into no parent namespace', () => {
        const resolved = setupTestConfig(configWithCards());
        const showcase = resolved.entryTypes['showcase'];
        expect(
            showcase && flattenEntryFields(showcase.fields).map((f) => f.name)
        ).toEqual(['cards']);
    });
});

describe('a plugin field type that affects no data', () => {
    it('is dropped by the parse', async () => {
        setupTestConfig({
            ...configWithCards(),
            plugins: [
                {
                    package: '@acme/preview',
                    fields: [
                        {
                            type: 'acme-preview',
                            component: './p.tsx',
                            affectsData: false,
                        },
                    ],
                },
            ],
        });

        const { values } = await safeParseFields(
            { title: 'Kept', preview: 'dropped' },
            [text('title'), { name: 'preview', type: 'acme-preview' }],
            parseContext
        );

        expect(values).toEqual({ title: 'Kept' });
    });
});
