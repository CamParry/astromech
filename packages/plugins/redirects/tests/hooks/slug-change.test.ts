/**
 * The `entry:afterUpdate` hook that records a 301 when an update moves an
 * entry's front-end path, keeping the rules free of loops and one hop deep.
 * The basic slug change and the unchanged-slug case sit in the end-to-end
 * suite beside this folder; these cover the rest.
 */

import type { RedirectMatch, RedirectsOptions } from '../../src/index';
import type { AstromechConfig } from '@/types/index';
import type { PluginTestApp } from '@tests/plugin-app';
import { makeTestConfig } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { redirects } from '../../src/index';

let app: PluginTestApp<'redirects'>;

function lookup(from: string): Promise<RedirectMatch | null> {
    return app.service.lookup({ from });
}

/** Store a rule through the plugin's own service. */
async function addRule(data: Record<string, unknown>): Promise<void> {
    await app.service.create({ data });
}

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

/** Every stored rule as `[from, to]`, in insertion order. */
async function rules(): Promise<[string, string][]> {
    const { rows } = await sql<{
        from: string;
        to: string;
    }>`SELECT "from", "to" FROM plugin_redirects_redirects ORDER BY rowid`.execute(
        app.db
    );
    return rows.map((row) => [row.from, row.to]);
}

/** Every stored disabled rule as `[from, to]`, in insertion order. */
async function disabledRules(): Promise<[string, string][]> {
    const { rows } = await sql<{
        from: string;
        to: string;
    }>`SELECT "from", "to" FROM plugin_redirects_redirects WHERE enabled = 0 ORDER BY rowid`.execute(
        app.db
    );
    return rows.map((row) => [row.from, row.to]);
}

describe('slug-change hook on a slug url template', () => {
    beforeEach(async () => {
        app = await createPluginTestApp('redirects', configWith('/blog/{slug}'));
    });

    it('records an enabled 301 from the old path to the new one', async () => {
        const post = await app.entries.create({ type: 'post', data: { title: 'Hello' } });

        await app.entries.update({
            type: 'post',
            id: post.id,
            data: { slug: 'goodbye' },
        });

        expect(await rules()).toEqual([['/blog/hello', '/blog/goodbye']]);
        expect(await lookup('/blog/hello')).toEqual({
            to: '/blog/goodbye',
            status: '301',
        });
    });

    it('points every earlier path straight at the newest one', async () => {
        const post = await app.entries.create({ type: 'post', data: { title: 'A' } });

        await app.entries.update({ type: 'post', id: post.id, data: { slug: 'b' } });
        await app.entries.update({ type: 'post', id: post.id, data: { slug: 'c' } });

        // Exactly two rules: repointing a rule records nothing for the rule itself.
        expect(await rules()).toEqual([
            ['/blog/a', '/blog/c'],
            ['/blog/b', '/blog/c'],
        ]);
        expect(await lookup('/blog/a')).toEqual({ to: '/blog/c', status: '301' });
        expect(await lookup('/blog/b')).toEqual({ to: '/blog/c', status: '301' });
    });

    it('leaves no loop when a slug changes back, so the live path answers nothing', async () => {
        const post = await app.entries.create({ type: 'post', data: { title: 'A' } });

        await app.entries.update({ type: 'post', id: post.id, data: { slug: 'b' } });
        await app.entries.update({ type: 'post', id: post.id, data: { slug: 'a' } });

        expect(await rules()).toEqual([['/blog/b', '/blog/a']]);
        expect(await lookup('/blog/a')).toBeNull();
        expect(await lookup('/blog/b')).toEqual({ to: '/blog/a', status: '301' });
    });

    it('records no second copy of an enabled rule that already exists', async () => {
        const post = await app.entries.create({ type: 'post', data: { title: 'A' } });
        await addRule({ from: '/blog/a', to: '/blog/b', enabled: true });

        await app.entries.update({ type: 'post', id: post.id, data: { slug: 'b' } });

        expect(await rules()).toEqual([['/blog/a', '/blog/b']]);
    });

    it('keeps an enabled rule that already redirects the old path elsewhere', async () => {
        const post = await app.entries.create({ type: 'post', data: { title: 'A' } });
        await addRule({ from: '/blog/a', to: '/elsewhere', enabled: true });

        await app.entries.update({ type: 'post', id: post.id, data: { slug: 'b' } });

        expect(await rules()).toEqual([['/blog/a', '/elsewhere']]);
        expect(await lookup('/blog/a')).toEqual({ to: '/elsewhere', status: '301' });
    });

    it('leaves a disabled rule alone', async () => {
        const post = await app.entries.create({ type: 'post', data: { title: 'A' } });
        await addRule({ from: '/blog/b', to: '/elsewhere', enabled: false });
        await addRule({ from: '/older', to: '/blog/a', enabled: false });

        await app.entries.update({ type: 'post', id: post.id, data: { slug: 'b' } });

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
        const note = await app.entries.create({ type: 'note', data: { title: 'Note' } });

        await app.entries.update({
            type: 'note',
            id: note.id,
            data: { slug: 'renamed' },
        });

        expect(await rules()).toEqual([]);
    });

    it('re-points and enables a disabled rule at the old path, since a path holds one rule', async () => {
        const post = await app.entries.create({ type: 'post', data: { title: 'A' } });
        await addRule({
            from: '/blog/a',
            to: '/elsewhere',
            status: '302',
            enabled: false,
        });

        await app.entries.update({ type: 'post', id: post.id, data: { slug: 'b' } });

        expect(await rules()).toEqual([['/blog/a', '/blog/b']]);
        expect(await disabledRules()).toEqual([]);
        expect(await lookup('/blog/a')).toEqual({ to: '/blog/b', status: '301' });
    });
});

describe('slug-change hook with generateOnSlugChange off', () => {
    beforeEach(async () => {
        app = await createPluginTestApp(
            'redirects',
            configWith('/blog/{slug}', { generateOnSlugChange: false })
        );
    });

    it('records nothing when a slug changes', async () => {
        const post = await app.entries.create({ type: 'post', data: { title: 'Hello' } });

        await app.entries.update({
            type: 'post',
            id: post.id,
            data: { slug: 'goodbye' },
        });

        expect(await rules()).toEqual([]);
    });
});

describe('slug-change hook on a url template that names a field', () => {
    beforeEach(async () => {
        app = await createPluginTestApp('redirects', configWith('/{category}/{slug}'));
    });

    it('records a redirect when that field changes', async () => {
        const post = await app.entries.create({
            type: 'post',
            data: { title: 'Hello', fields: { category: 'news' } },
        });

        await app.entries.update({
            type: 'post',
            id: post.id,
            data: { fields: { category: 'guides' } },
        });

        expect(await rules()).toEqual([['/news/hello', '/guides/hello']]);
    });

    it('records nothing when the field was empty, since the old path does not exist', async () => {
        const post = await app.entries.create({ type: 'post', data: { title: 'Hello' } });

        await app.entries.update({
            type: 'post',
            id: post.id,
            data: { fields: { category: 'news' } },
        });

        expect(await rules()).toEqual([]);
        expect(await lookup('/')).toBeNull();
    });
});
