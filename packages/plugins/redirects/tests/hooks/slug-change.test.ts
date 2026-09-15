/**
 * The `entry:afterUpdate` hook that records a 301 when an update moves an
 * entry's front-end path, keeping the rules free of loops and one hop deep.
 * The basic slug change and the unchanged-slug case sit in the end-to-end
 * suite beside this folder; these cover the rest.
 */

import type { RedirectMatch, RedirectsOptions } from '../../src/index';
import type { DB } from '@/database/types';
import type { AstromechConfig, EntriesService } from '@/types/index';
import type { Kysely } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService as localEntries } from '@/app-context/services';
import { pluginServices } from '@/plugins/runtime/plugin-services';
import { redirects } from '../../src/index';

type RedirectsService = Record<string, (input?: unknown) => Promise<unknown>>;

function lookup(from: string): Promise<RedirectMatch | null> {
    const service = pluginServices['redirects'] as unknown as
        | RedirectsService
        | undefined;
    const fn = service?.['lookup'];
    if (!fn) throw new Error('redirects.lookup not registered');
    return fn({ from }) as Promise<RedirectMatch | null>;
}

/** The one entries service, typed to the wide API for these round-trips. */
const entries = (): EntriesService => localEntries as unknown as EntriesService;

/** The harness config with `post` given `url`, and the redirects plugin. */
function configWith(url: string, options?: RedirectsOptions): AstromechConfig {
    const base = makeTestConfig();
    const post = base.entries['post'];
    if (!post) throw new Error('test harness missing `post` entry type');
    return {
        ...base,
        entries: { ...base.entries, post: { ...post, url } },
        plugins: [redirects(options)],
    };
}

let db: Kysely<DB>;

/** Every stored rule as `[from, to]`, in insertion order. */
async function rules(): Promise<[string, string][]> {
    const { rows } = await sql<{
        from: string;
        to: string;
    }>`SELECT "from", "to" FROM plugin_redirects_redirects ORDER BY rowid`.execute(db);
    return rows.map((row) => [row.from, row.to]);
}

/** Every stored disabled rule as `[from, to]`, in insertion order. */
async function disabledRules(): Promise<[string, string][]> {
    const { rows } = await sql<{
        from: string;
        to: string;
    }>`SELECT "from", "to" FROM plugin_redirects_redirects WHERE enabled = 0 ORDER BY rowid`.execute(
        db
    );
    return rows.map((row) => [row.from, row.to]);
}

describe('slug-change hook on a slug url template', () => {
    beforeEach(async () => {
        db = await createTestDb();
        setupTestConfig(configWith('/blog/{slug}'));
    });

    it('records an enabled 301 from the old path to the new one', async () => {
        const post = await entries().create({ type: 'post', data: { title: 'Hello' } });

        await entries().update({ type: 'post', id: post.id, data: { slug: 'goodbye' } });

        expect(await rules()).toEqual([['/blog/hello', '/blog/goodbye']]);
        expect(await lookup('/blog/hello')).toEqual({
            to: '/blog/goodbye',
            status: '301',
        });
    });

    it('points every earlier path straight at the newest one', async () => {
        const post = await entries().create({ type: 'post', data: { title: 'A' } });

        await entries().update({ type: 'post', id: post.id, data: { slug: 'b' } });
        await entries().update({ type: 'post', id: post.id, data: { slug: 'c' } });

        // Exactly two rules: repointing a rule records nothing for the rule itself.
        expect(await rules()).toEqual([
            ['/blog/a', '/blog/c'],
            ['/blog/b', '/blog/c'],
        ]);
        expect(await lookup('/blog/a')).toEqual({ to: '/blog/c', status: '301' });
        expect(await lookup('/blog/b')).toEqual({ to: '/blog/c', status: '301' });
    });

    it('leaves no loop when a slug changes back, so the live path answers nothing', async () => {
        const post = await entries().create({ type: 'post', data: { title: 'A' } });

        await entries().update({ type: 'post', id: post.id, data: { slug: 'b' } });
        await entries().update({ type: 'post', id: post.id, data: { slug: 'a' } });

        expect(await rules()).toEqual([['/blog/b', '/blog/a']]);
        expect(await lookup('/blog/a')).toBeNull();
        expect(await lookup('/blog/b')).toEqual({ to: '/blog/a', status: '301' });
    });

    it('records no second copy of an enabled rule that already exists', async () => {
        const post = await entries().create({ type: 'post', data: { title: 'A' } });
        await entries().create({
            type: 'redirects/redirect',
            data: { fields: { from: '/blog/a', to: '/blog/b', enabled: true } },
        });

        await entries().update({ type: 'post', id: post.id, data: { slug: 'b' } });

        expect(await rules()).toEqual([['/blog/a', '/blog/b']]);
    });

    it('keeps an enabled rule that already redirects the old path elsewhere', async () => {
        const post = await entries().create({ type: 'post', data: { title: 'A' } });
        await entries().create({
            type: 'redirects/redirect',
            data: { fields: { from: '/blog/a', to: '/elsewhere', enabled: true } },
        });

        await entries().update({ type: 'post', id: post.id, data: { slug: 'b' } });

        expect(await rules()).toEqual([['/blog/a', '/elsewhere']]);
        expect(await lookup('/blog/a')).toEqual({ to: '/elsewhere', status: '301' });
    });

    it('leaves a disabled rule alone', async () => {
        const post = await entries().create({ type: 'post', data: { title: 'A' } });
        await entries().create({
            type: 'redirects/redirect',
            data: { fields: { from: '/blog/b', to: '/elsewhere', enabled: false } },
        });
        await entries().create({
            type: 'redirects/redirect',
            data: { fields: { from: '/older', to: '/blog/a', enabled: false } },
        });

        await entries().update({ type: 'post', id: post.id, data: { slug: 'b' } });

        expect(await disabledRules()).toEqual([
            ['/blog/b', '/elsewhere'],
            ['/older', '/blog/a'],
        ]);
        expect(await rules()).toEqual([
            ['/blog/b', '/elsewhere'],
            ['/older', '/blog/a'],
            ['/blog/a', '/blog/b'],
        ]);
    });

    it('records nothing for a type with no url template', async () => {
        const note = await entries().create({ type: 'note', data: { title: 'Note' } });

        await entries().update({ type: 'note', id: note.id, data: { slug: 'renamed' } });

        expect(await rules()).toEqual([]);
    });

    it('records nothing when a redirect rule itself is updated', async () => {
        const rule = await entries().create({
            type: 'redirects/redirect',
            data: { fields: { from: '/a', to: '/b' } },
        });

        await entries().update({
            type: 'redirects/redirect',
            id: rule.id,
            data: { fields: { from: '/c', to: '/b' } },
        });

        expect(await rules()).toEqual([['/c', '/b']]);
    });
});

describe('slug-change hook with generateOnSlugChange off', () => {
    beforeEach(async () => {
        db = await createTestDb();
        setupTestConfig(configWith('/blog/{slug}', { generateOnSlugChange: false }));
    });

    it('records nothing when a slug changes', async () => {
        const post = await entries().create({ type: 'post', data: { title: 'Hello' } });

        await entries().update({ type: 'post', id: post.id, data: { slug: 'goodbye' } });

        expect(await rules()).toEqual([]);
    });
});

describe('slug-change hook on a url template that names a field', () => {
    beforeEach(async () => {
        db = await createTestDb();
        setupTestConfig(configWith('/{category}/{slug}'));
    });

    it('records a redirect when that field changes', async () => {
        const post = await entries().create({
            type: 'post',
            data: { title: 'Hello', fields: { category: 'news' } },
        });

        await entries().update({
            type: 'post',
            id: post.id,
            data: { fields: { category: 'guides' } },
        });

        expect(await rules()).toEqual([['/news/hello', '/guides/hello']]);
    });

    it('records nothing when the field was empty, since the old path does not exist', async () => {
        const post = await entries().create({ type: 'post', data: { title: 'Hello' } });

        await entries().update({
            type: 'post',
            id: post.id,
            data: { fields: { category: 'news' } },
        });

        expect(await rules()).toEqual([]);
        expect(await lookup('/')).toBeNull();
    });
});
