/**
 * `create` honours the `slug` capability.
 *
 * The capability was previously enforced only at the HTTP edge
 * (`transport/http/routes/entries.ts`), so a create called from a plugin, the
 * local transport or MCP still derived a slug from the title on a `slug: false`
 * type, and still stored an explicit one. The operation now decides: a slug
 * needs both the capability and a source.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { entriesService } from '@/entries/index';
import type { AstromechConfig } from '@/types/index';

const api = entriesService;

/** The shared config plus a titled type with the slug capability off. */
function configWithSlugOffType(): AstromechConfig {
    const config = makeTestConfig();
    return {
        ...config,
        entries: {
            ...config.entries,
            note: {
                single: 'Note',
                plural: 'Notes',
                slug: false,
                fields: [{ name: 'body', type: 'text', label: 'Body' }],
            },
        },
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(configWithSlugOffType());
});

describe('a titled type with slug off', () => {
    it('does not derive a slug from the title', async () => {
        const entry = await api.create({ type: 'note', title: 'My Note' });
        expect(entry.title).toBe('My Note');
        expect(entry.slug).toBeNull();
    });

    it('ignores an explicit slug rather than storing it', async () => {
        const entry = await api.create({
            type: 'note',
            title: 'My Note',
            slug: 'my-note',
        });
        expect(entry.slug).toBeNull();
    });

    it('does not collide when two entries share a title', async () => {
        const first = await api.create({ type: 'note', title: 'Same' });
        const second = await api.create({ type: 'note', title: 'Same' });
        expect(first.slug).toBeNull();
        expect(second.slug).toBeNull();
    });
});

describe('a titled type with slug on is unaffected', () => {
    it('still derives a slug from the title', async () => {
        const entry = await api.create({ type: 'post', title: 'My Post' });
        expect(entry.slug).toBe('my-post');
    });

    it('still stores and uniquifies an explicit slug', async () => {
        const first = await api.create({ type: 'post', title: 'A', slug: 'dup' });
        const second = await api.create({ type: 'post', title: 'B', slug: 'dup' });
        expect(first.slug).toBe('dup');
        expect(second.slug).toBe('dup-2');
    });
});

describe('a titleless type with slug off', () => {
    it('ignores an explicit slug', async () => {
        const entry = await api.create({ type: 'snippet', slug: 'a-snippet' });
        expect(entry.slug).toBeNull();
    });
});
