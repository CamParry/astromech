/**
 * `create` honours the `slug` capability on every path, not only over HTTP: a
 * plugin, the local transport or MCP creating a `slug: false` entry derives no
 * slug, and an explicit one is refused. A slug needs both the capability and a source.
 */

import type { AstromechConfig } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService } from '@/app-context/services';

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
        const entry = await api.create({ type: 'note', data: { title: 'My Note' } });
        expect(entry.title).toBe('My Note');
        expect(entry.slug).toBeNull();
    });

    it('refuses an explicit slug rather than storing it', async () => {
        await expect(
            api.create({ type: 'note', data: { title: 'My Note', slug: 'my-note' } })
        ).rejects.toMatchObject({ name: 'CapabilityError', capability: 'slug' });
    });

    it('does not collide when two entries share a title', async () => {
        const first = await api.create({ type: 'note', data: { title: 'Same' } });
        const second = await api.create({ type: 'note', data: { title: 'Same' } });
        expect(first.slug).toBeNull();
        expect(second.slug).toBeNull();
    });
});

describe('a titled type with slug on is unaffected', () => {
    it('still derives a slug from the title', async () => {
        const entry = await api.create({ type: 'post', data: { title: 'My Post' } });
        expect(entry.slug).toBe('my-post');
    });

    it('still stores and uniquifies an explicit slug', async () => {
        const first = await api.create({
            type: 'post',
            data: { title: 'A', slug: 'dup' },
        });
        const second = await api.create({
            type: 'post',
            data: { title: 'B', slug: 'dup' },
        });
        expect(first.slug).toBe('dup');
        expect(second.slug).toBe('dup-2');
    });
});

describe('a titleless type with slug off', () => {
    it('refuses an explicit slug', async () => {
        await expect(
            api.create({ type: 'snippet', data: { slug: 'a-snippet' } })
        ).rejects.toMatchObject({ name: 'CapabilityError', capability: 'slug' });
    });
});
