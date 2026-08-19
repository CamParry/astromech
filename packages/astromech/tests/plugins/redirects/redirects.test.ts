/**
 * Slice 5 validator: the redirects plugin runs on its OWN table
 * (`plugin_redirects_redirects`) via `tableStorage`, exercised end-to-end
 * through the entries service, the plugin service, and the slug-change hook.
 *
 * Covers:
 * - a create through the entries service lands a row in
 *   plugin_redirects_redirects, NOT entries.
 * - public `lookup` resolves match / miss / disabled.
 * - the entry:afterUpdate hook records old → new on a root slug change, and
 *   does nothing when the slug is unchanged.
 * - hooks observe the QUALIFIED type id (`redirects/redirect`) on afterCreate.
 */

import type { DB } from '@/database/types';
import type {
    AstromechConfig,
    EntriesService,
    PluginDefinition,
    PluginServiceNamespace,
    ResolvedConfig,
} from '@/types/index';
import type { RedirectMatch } from '@astromech/redirects';
import type { Kysely } from 'kysely';
import { redirects } from '@astromech/redirects';
import {
    createTestDb,
    makeTestConfig,
    registerTestPlugins,
    setupTestConfig,
} from '@tests/harness';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService as localEntries } from '@/entries/service';
import { defineHook } from '@/plugins/define-hook';
import { pluginServices } from '@/plugins/runtime/plugin-services';

// Type-level proof: redirects.lookup carries real Input/Output via
// self-augmentation of `PluginServiceNamespace`, which is the type behind
// `app.plugins` and behind `ctx.plugins` alike.
async function _serviceTypeProof(plugins: PluginServiceNamespace) {
    const result: RedirectMatch | null = await plugins.redirects.lookup({
        from: '/x',
    });
    void result;
}
void _serviceTypeProof;

// `pluginServices.redirects` — the loosely-typed RPC method map. There is no
// per-plugin entries sub-API: a plugin entry type is addressed on the one
// entries service by its qualified id.
type RedirectsService = Record<string, (input?: unknown) => Promise<unknown>>;
const redirectsService = (): RedirectsService =>
    pluginServices['redirects'] as unknown as RedirectsService;

/** The redirect entry type's qualified id — how every caller addresses it. */
const REDIRECT = 'redirects/redirect';

/** The one entries service, typed to the wide API for these round-trips. */
const redirectEntriesService = (): EntriesService =>
    localEntries as unknown as EntriesService;

/** Public `lookup` RPC method, the way a frontend middleware would call it. */
const lookup = (input: { from: string }): Promise<RedirectMatch | null> => {
    const fn = redirectsService()['lookup'];
    if (!fn) throw new Error('redirects.lookup not registered');
    return fn(input) as Promise<RedirectMatch | null>;
};

let db: Kysely<DB>;

function configWithRedirects(): AstromechConfig {
    const base = makeTestConfig();
    // The slug-change hook only records a redirect for types with a `url`
    // template (core's single source of truth for an entry's front-end path).
    // Give the test `post` one — scoped here, not in the shared harness, so
    // other suites (e.g. menus) keep their existing entry-ref behaviour.
    const basePost = base.entries['post'];
    if (!basePost) throw new Error('test harness missing `post` entry type');
    const post = { ...basePost, url: '/{slug}' };
    return {
        ...base,
        entries: { ...base.entries, post },
        plugins: [redirects()],
    };
}

/** Raw row count in the plugin's own table. */
async function redirectRows(): Promise<Record<string, unknown>[]> {
    const { rows } = await sql`SELECT * FROM plugin_redirects_redirects`.execute(db);
    return rows as Record<string, unknown>[];
}

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig(configWithRedirects());
});

describe('redirects — own-table storage', () => {
    it('create lands in plugin_redirects_redirects, not entries', async () => {
        await redirectEntriesService().create({
            type: REDIRECT,
            fields: { from: '/old', to: '/new', status: '301', enabled: true },
        });

        const rows = await redirectRows();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.['from']).toBe('/old');
        expect(rows[0]?.['to']).toBe('/new');

        const { rows: entryRows } =
            await sql`SELECT * FROM entries WHERE type = 'redirects/redirect'`.execute(
                db
            );
        expect(entryRows).toHaveLength(0);
    });

    it('stamps the qualified type onto entries read back from the own table', async () => {
        const created = await redirectEntriesService().create({
            type: REDIRECT,
            fields: { from: '/old', to: '/new', status: '301', enabled: true },
            status: 'published',
        });

        // query() must return a complete entry — tableStorage rows have no
        // `type` column, so the entries service stamps it. Without this, admin
        // search builds a broken `/entries/undefined/<id>` link.
        const listed = await redirectEntriesService().query({
            type: REDIRECT,
            limit: 10,
        });
        expect(listed.data).toHaveLength(1);
        expect(listed.data[0]?.type).toBe('redirects/redirect');

        const fetched = await redirectEntriesService().get({
            type: REDIRECT,
            id: created.id,
        });
        expect(fetched?.type).toBe('redirects/redirect');
    });
});

describe('redirects — lookup', () => {
    beforeEach(async () => {
        // Redirects must be published to pass the public visibility filter.
        await redirectEntriesService().create({
            type: REDIRECT,
            fields: { from: '/match', to: '/dest', status: '302', enabled: true },
            status: 'published',
        });
        await redirectEntriesService().create({
            type: REDIRECT,
            fields: { from: '/off', to: '/nope', status: '301', enabled: false },
            status: 'published',
        });
    });

    it('resolves an enabled match', async () => {
        const result = await lookup({ from: '/match' });
        expect(result).toEqual({ to: '/dest', status: '302' });
    });

    it('returns null for a non-matching path', async () => {
        const result = await lookup({ from: '/missing' });
        expect(result).toBeNull();
    });

    it('skips a disabled redirect', async () => {
        const result = await lookup({ from: '/off' });
        expect(result).toBeNull();
    });
});

describe('redirects — slug-change hook', () => {
    it('records a redirect when a root entry slug changes', async () => {
        const post = await localEntries.create({ type: 'post', title: 'Hello' });
        expect(post.slug).toBe('hello');

        await localEntries.update({
            type: 'post',
            id: post.id,
            data: { slug: 'goodbye' },
        });

        const rows = await redirectRows();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.['from']).toBe('/hello');
        expect(rows[0]?.['to']).toBe('/goodbye');
    });

    it('creates nothing when the slug is unchanged', async () => {
        const post = await localEntries.create({ type: 'post', title: 'Stable' });
        await localEntries.update({
            type: 'post',
            id: post.id,
            data: { title: 'Stable Renamed' },
        });
        expect(await redirectRows()).toHaveLength(0);
    });
});

describe('redirects — hooks observe the qualified type', () => {
    it('fires entry:afterCreate with type "redirects/redirect"', async () => {
        const observed: string[] = [];

        const probe: PluginDefinition = {
            package: '@astromech/probe',
            hooks: [
                defineHook('entry:afterCreate', (event) => {
                    observed.push(event.type);
                }),
            ],
        };

        // Re-register both plugins so the probe and redirects coexist.
        const resolved: ResolvedConfig = setupTestConfig(configWithRedirects());
        registerTestPlugins([redirects(), probe], resolved);

        await redirectEntriesService().create({
            type: REDIRECT,
            fields: { from: '/a', to: '/b', status: '301', enabled: true },
        });

        expect(observed).toContain('redirects/redirect');
    });
});
