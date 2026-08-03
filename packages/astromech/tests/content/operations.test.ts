/**
 * Service-level tests for the content operations (translate / transform /
 * generate). Every provider is the in-memory fake, so nothing here touches a
 * network.
 *
 * `article` carries the whole eligibility matrix: prose, a non-translatable
 * field, a private field, non-text fields, a repeater, and a rich-text field
 * with a restrictive `allow` list.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { createFakeContentProvider } from '@tests/fake-content-provider.js';
import { setContentProvider } from '@/content/provider.js';
import { generate, transform, translate } from '@/content/service.js';
import { ContentOperationError, ContentProviderContractError } from '@/content/errors.js';
import { CapabilityError } from '@/entries/errors.js';
import { checkRichTextDocument } from '@/fields/rich-text/validate.js';
import { markdownToDoc } from '@/fields/rich-text/markdown.js';
import { ValidationError } from '@/errors/index.js';
import { create } from '@/entries/operations/create.js';
import { get } from '@/entries/operations/get.js';
import { getStaged } from '@/entries/operations/staging/get.js';
import type { AstromechConfig, Entry, JsonObject } from '@/types/index.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeContentConfig(): AstromechConfig {
    const cfg = makeTestConfig();
    cfg.entries['article'] = {
        single: 'Article',
        plural: 'Articles',
        translatable: true,
        staging: true,
        url: '/articles/{slug}',
        fields: [
            { name: 'summary', type: 'text', label: 'Summary' },
            { name: 'body', type: 'richtext', label: 'Body' },
            { name: 'sku', type: 'text', label: 'SKU', translatable: false },
            { name: 'secret', type: 'text', label: 'Secret', private: true },
            { name: 'tagline', type: 'text', validation: [{ maxLength: 12 }] },
            { name: 'rating', type: 'number', label: 'Rating' },
            { name: 'tone', type: 'select', options: ['calm', 'loud'] },
            {
                name: 'note',
                type: 'richtext',
                label: 'Note',
                allow: { heading: false, bulletList: false },
            },
            {
                name: 'sections',
                type: 'repeater',
                label: 'Sections',
                fields: [
                    { name: 'heading', type: 'text', label: 'Heading' },
                    { name: 'count', type: 'number', label: 'Count' },
                ],
            },
        ],
    };
    // `plain` has no staging capability — the clear-error case.
    cfg.entries['plain'] = {
        single: 'Plain',
        plural: 'Plains',
        fields: [{ name: 'summary', type: 'text' }],
    };
    return cfg;
}

/** A document with a heading, a marked-up paragraph and a two-item list. */
function bodyDoc(): JsonObject {
    return {
        type: 'doc',
        content: [
            {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Hello heading' }],
            },
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: 'Hello ' },
                    { type: 'text', text: 'world', marks: [{ type: 'bold' }] },
                    { type: 'text', text: ' and ' },
                    {
                        type: 'text',
                        text: 'a link',
                        marks: [
                            {
                                type: 'link',
                                attrs: { href: 'https://example.com/a' },
                            },
                        ],
                    },
                ],
            },
            {
                type: 'bulletList',
                content: [
                    {
                        type: 'listItem',
                        content: [
                            {
                                type: 'paragraph',
                                content: [{ type: 'text', text: 'Hello one' }],
                            },
                        ],
                    },
                    {
                        type: 'listItem',
                        content: [
                            {
                                type: 'paragraph',
                                content: [{ type: 'text', text: 'Hello two' }],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

function articleFields(): JsonObject {
    return {
        summary: 'Hello summary',
        body: bodyDoc(),
        sku: 'ABC-123',
        secret: 'do not send',
        tagline: 'Hello',
        rating: 5,
        tone: 'calm',
        sections: [
            { _id: 'a1', heading: 'Hello one', count: 1 },
            { _id: 'b2', heading: 'Hello two', count: 2 },
        ],
    };
}

async function makeArticle(overrides?: JsonObject): Promise<Entry> {
    return create({
        type: 'article',
        title: 'Hello title',
        slug: 'hello',
        locale: 'en',
        status: 'published',
        fields: { ...articleFields(), ...overrides },
    });
}

type Node = { type?: string; content?: Node[] };

/** Block-only shape of a document: node types, order and nesting, no text. */
function blockOutline(node: Node): unknown {
    const children = (node.content ?? []).filter(
        (child) => child.type !== 'text' && child.type !== 'hardBreak'
    );
    if (children.length === 0) return node.type;
    return { type: node.type, content: children.map(blockOutline) };
}

/** Every input string the provider was handed, across all calls. */
function allInputs(provider: { requests: { inputs: string[] }[] }): string[] {
    return provider.requests.flatMap((request) => request.inputs);
}

/** Field labels the provider was told about, in call order. */
function calledLabels(provider: {
    requests: { context?: { fieldLabel: string } | undefined }[];
}): string[] {
    return provider.requests.map((request) => request.context?.fieldLabel ?? '');
}

const swapHello = {
    rewrite: (input: string): string => input.replace(/Hello/g, 'Salut'),
};

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeContentConfig());
    setContentProvider(createFakeContentProvider(swapHello));
});

// ============================================================================
// translate — structure and marks
// ============================================================================

describe('translate', () => {
    it('preserves rich-text block structure exactly, changing only text', async () => {
        const source = await makeArticle();

        const result = await translate({ type: 'article', id: source.id, locale: 'de' });
        const sibling = await get({ type: 'article', id: result.id, full: true });

        const before = blockOutline(source.fields['body'] as Node);
        const after = blockOutline(sibling?.fields['body'] as Node);
        expect(after).toEqual(before);

        const heading = (sibling?.fields['body'] as Node).content?.[0];
        expect(heading?.content?.[0]).toMatchObject({ text: 'Salut heading' });
    });

    it('keeps inline marks: bold stays bold and a link keeps its href', async () => {
        const source = await makeArticle();

        const result = await translate({ type: 'article', id: source.id, locale: 'de' });
        const sibling = await get({ type: 'article', id: result.id, full: true });

        const paragraph = (sibling?.fields['body'] as Node).content?.[1] as {
            content?: { text?: string; marks?: { type: string; attrs?: JsonObject }[] }[];
        };
        expect(paragraph.content?.[0]).toEqual({ type: 'text', text: 'Salut ' });
        expect(paragraph.content?.[1]).toEqual({
            type: 'text',
            text: 'world',
            marks: [{ type: 'bold' }],
        });
        expect(paragraph.content?.[3]).toEqual({
            type: 'text',
            text: 'a link',
            marks: [{ type: 'link', attrs: { href: 'https://example.com/a' } }],
        });
    });

    it('sends each block separately rather than the document as a whole', async () => {
        const provider = createFakeContentProvider(swapHello);
        setContentProvider(provider);
        const source = await makeArticle();

        await translate({ type: 'article', id: source.id, locale: 'de' });

        const body = provider.requests.find((r) => r.context?.fieldLabel === 'Body');
        expect(body?.format).toBe('markdown');
        expect(body?.inputs).toEqual([
            'Hello heading',
            'Hello **world** and [a link](https://example.com/a)',
            'Hello one',
            'Hello two',
        ]);
    });

    it('never sends a non-translatable, private or non-text field', async () => {
        const provider = createFakeContentProvider(swapHello);
        setContentProvider(provider);
        const source = await makeArticle();

        const result = await translate({ type: 'article', id: source.id, locale: 'de' });

        expect(calledLabels(provider).sort()).toEqual([
            'Body',
            'Heading',
            'Heading',
            'Summary',
            'Tagline',
        ]);
        for (const withheld of ['ABC-123', 'do not send', '5', 'calm']) {
            expect(allInputs(provider)).not.toContain(withheld);
        }

        const sibling = await get({ type: 'article', id: result.id, full: true });
        expect(sibling?.fields['sku']).toBe('ABC-123');
        expect(sibling?.fields['secret']).toBe('do not send');
        expect(sibling?.fields['rating']).toBe(5);
    });

    it('requires the translatable capability', async () => {
        const plain = await create({
            type: 'plain',
            title: 'P',
            fields: { summary: 'x' },
        });

        await expect(
            translate({ type: 'plain', id: plain.id, locale: 'de' })
        ).rejects.toBeInstanceOf(CapabilityError);
    });
});

// ============================================================================
// Where the output lands
// ============================================================================

describe('translate — destination', () => {
    it('creates an unpublished sibling in the same localeGroup for a new locale', async () => {
        const source = await makeArticle();

        const result = await translate({ type: 'article', id: source.id, locale: 'de' });
        const sibling = await get({ type: 'article', id: result.id, full: true });

        expect(result.outcome).toBe('created');
        expect(result.previewUrl).toBeNull();
        expect(result.previewToken).toBeUndefined();
        expect(sibling?.locale).toBe('de');
        expect(sibling?.localeGroup).toBe(source.localeGroup);
        expect(sibling?.status).toBe('unpublished');
        expect(sibling?.publishedAt).toBeNull();
        expect(sibling?.fields['summary']).toBe('Salut summary');

        // The source is untouched.
        const reread = await get({ type: 'article', id: source.id, full: true });
        expect(reread?.fields).toEqual(source.fields);
    });

    it('stages the change and issues a preview token for an existing locale', async () => {
        const source = await makeArticle();
        const german = await create({
            type: 'article',
            title: 'Hallo',
            slug: 'hallo',
            locale: 'de',
            localeGroup: source.localeGroup,
            status: 'published',
            fields: { ...articleFields(), summary: 'Hallo Zusammenfassung' },
        });

        const result = await translate({ type: 'article', id: source.id, locale: 'de' });

        expect(result.outcome).toBe('staged');
        expect(result.previewToken).toBeTypeOf('string');
        expect(result.previewUrl).toBe(
            `/articles/hallo?preview=${encodeURIComponent(result.previewToken ?? '')}&staged=1`
        );

        const staged = await getStaged({ type: 'article', id: german.id });
        expect(staged?.id).toBe(result.id);
        expect(staged?.status).toBe('unpublished');
        expect(staged?.fields['summary']).toBe('Salut summary');

        // The live German entry is untouched.
        const live = await get({ type: 'article', id: german.id, full: true });
        expect(live?.fields['summary']).toBe('Hallo Zusammenfassung');
        expect(live?.status).toBe('published');
    });

    it('stages transform and generate on the entry itself', async () => {
        const source = await makeArticle();

        const result = await transform({
            type: 'article',
            id: source.id,
            paths: ['summary'],
            instruction: 'tighten',
        });

        expect(result.outcome).toBe('staged');
        const staged = await getStaged({ type: 'article', id: source.id });
        expect(staged?.id).toBe(result.id);
        expect(staged?.fields['summary']).toBe('Salut summary');

        const live = await get({ type: 'article', id: source.id, full: true });
        expect(live?.fields['summary']).toBe('Hello summary');
        expect(live?.status).toBe('published');
    });

    it('fails clearly when the type cannot stage', async () => {
        const plain = await create({
            type: 'plain',
            title: 'P',
            fields: { summary: 'x' },
        });

        await expect(
            transform({ type: 'plain', id: plain.id, instruction: 'tighten' })
        ).rejects.toThrow(/does not support capability: staging/);
    });
});

// ============================================================================
// Provider contract and validation — all-or-nothing
// ============================================================================

describe('all-or-nothing', () => {
    it('fails the whole operation when the provider miscounts its outputs', async () => {
        const provider = createFakeContentProvider({ ...swapHello, outputCount: 3 });
        setContentProvider(provider);
        const source = await makeArticle();

        await expect(
            translate({ type: 'article', id: source.id, locale: 'de' })
        ).rejects.toBeInstanceOf(ContentProviderContractError);

        const reread = await get({ type: 'article', id: source.id, full: true });
        expect(reread?.fields).toEqual(source.fields);
        expect(Object.keys(reread?.locales ?? {})).toEqual(['en']);
        expect(await getStaged({ type: 'article', id: source.id })).toBeNull();
    });

    it('leaves no staged row behind when the rewritten value fails validation', async () => {
        setContentProvider(
            createFakeContentProvider({
                rewrite: () => 'far too long to pass maxLength',
            })
        );
        const source = await makeArticle();

        await expect(
            transform({
                type: 'article',
                id: source.id,
                paths: ['tagline'],
                instruction: 'expand',
            })
        ).rejects.toBeInstanceOf(ValidationError);

        expect(await getStaged({ type: 'article', id: source.id })).toBeNull();
        const reread = await get({ type: 'article', id: source.id, full: true });
        expect(reread?.fields['tagline']).toBe('Hello');
    });

    it('clamps a reply to the field’s allow list instead of writing a forbidden node', async () => {
        setContentProvider(
            createFakeContentProvider({
                rewrite: () => '# Big heading\n\n- one\n- two',
            })
        );
        const source = await makeArticle({
            note: {
                type: 'doc',
                content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'Note' }] },
                ],
            },
        });

        const result = await transform({
            type: 'article',
            id: source.id,
            paths: ['note'],
            instruction: 'restructure',
        });

        const staged = await getStaged({ type: 'article', id: source.id });
        expect(staged?.id).toBe(result.id);
        const types = ((staged?.fields['note'] as Node).content ?? []).map((n) => n.type);
        expect(types).not.toContain('heading');
        expect(types).not.toContain('bulletList');
        expect(types).toEqual(['paragraph', 'paragraph', 'paragraph']);

        // The clamp is what makes that safe: parsed WITHOUT the field's allow
        // list, the same reply is a document this field would reject.
        expect(
            checkRichTextDocument(markdownToDoc('# Big heading'), {
                heading: false,
                bulletList: false,
            })
        ).not.toBe(true);
    });
});

// ============================================================================
// paths
// ============================================================================

describe('paths', () => {
    it('restricts the operation to what it names', async () => {
        const provider = createFakeContentProvider(swapHello);
        setContentProvider(provider);
        const source = await makeArticle();

        const result = await transform({
            type: 'article',
            id: source.id,
            paths: ['sections[a1].heading'],
            instruction: 'tighten',
        });

        expect(calledLabels(provider)).toEqual(['Heading']);
        expect(result.fields).toEqual([
            {
                path: 'sections[a1].heading',
                fieldType: 'text',
                inputs: 1,
                changed: true,
            },
        ]);

        const staged = await getStaged({ type: 'article', id: source.id });
        const sections = staged?.fields['sections'] as JsonObject[];
        expect(sections[0]?.['heading']).toBe('Salut one');
        expect(sections[1]?.['heading']).toBe('Hello two');
        expect(staged?.fields['summary']).toBe('Hello summary');
    });

    it('selects a whole container subtree from its root path', async () => {
        const provider = createFakeContentProvider(swapHello);
        setContentProvider(provider);
        const source = await makeArticle();

        await transform({
            type: 'article',
            id: source.id,
            paths: ['sections'],
            instruction: 'tighten',
        });

        expect(calledLabels(provider)).toEqual(['Heading', 'Heading']);
    });

    it('fails when nothing it names is eligible', async () => {
        const source = await makeArticle();

        await expect(
            transform({
                type: 'article',
                id: source.id,
                paths: ['rating', 'secret'],
                instruction: 'tighten',
            })
        ).rejects.toBeInstanceOf(ContentOperationError);
    });
});

// ============================================================================
// generate
// ============================================================================

describe('generate', () => {
    it('fills a field that had no value', async () => {
        const provider = createFakeContentProvider({ rewrite: () => 'Brand new' });
        setContentProvider(provider);
        const source = await makeArticle({ summary: '' });

        const result = await generate({
            type: 'article',
            id: source.id,
            paths: ['summary'],
            instruction: 'write a summary',
        });

        expect(provider.requests[0]?.inputs).toEqual(['']);
        const staged = await getStaged({ type: 'article', id: source.id });
        expect(staged?.id).toBe(result.id);
        expect(staged?.fields['summary']).toBe('Brand new');
    });

    it('reports per-field what changed', async () => {
        setContentProvider(createFakeContentProvider({ rewrite: (input) => input }));
        const source = await makeArticle();

        const result = await generate({
            type: 'article',
            id: source.id,
            paths: ['summary', 'body'],
            instruction: 'leave it alone',
        });

        expect(result.fields).toEqual([
            { path: 'summary', fieldType: 'text', inputs: 1, changed: false },
            { path: 'body', fieldType: 'richtext', inputs: 1, changed: false },
        ]);
    });
});
