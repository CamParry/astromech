/**
 * Slice 5 validator: the redirects plugin runs on its OWN table
 * (`plugin_redirects_redirects`) via `tableStorage`, exercised end-to-end
 * through the orchestrator, the plugin SDK, and the slug-change hook.
 *
 * Covers:
 * - ctx-scoped create lands a row in plugin_redirects_redirects, NOT entries.
 * - public `lookup` resolves match / miss / disabled.
 * - the entry:afterUpdate hook records old → new on a root slug change, and
 *   does nothing when the slug is unchanged.
 * - hooks observe the QUALIFIED type id (`redirects/redirect`) on afterCreate.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import {
    createTestDb,
    makeTestConfig,
    registerTestPlugins,
    setupTestConfig,
} from '@/test/harness.js';
import '@/sdk/local/index.js'; // registers the plugin SDK client (setPluginSdkClient)
import { localPlugins } from '@/sdk/local/plugins.js';
import { entries as localEntries } from '@/sdk/local/entries.js';
import { redirects } from '@/plugins/redirects/index.js';
import type { RedirectMatch } from '@/plugins/redirects/index.js';
import type {
    AstromechConfig,
    EntriesApi,
    PluginDefinition,
    ResolvedConfig,
} from '@/types/index.js';

// `Astromech.plugins.redirects` — the loosely-typed RPC method map, with the
// reserved `entries` sub-API. Cast narrowly at each access point.
type RedirectsSdk = Record<string, (input?: unknown) => Promise<unknown>> & {
    entries: EntriesApi;
};
const redirectsSdk = (): RedirectsSdk =>
    localPlugins['redirects'] as unknown as RedirectsSdk;

/** Plugin entries sub-API: `redirectEntriesApi()`. */
const redirectEntriesApi = (): EntriesApi => redirectsSdk().entries;

/** Public `lookup` RPC method, the way a frontend middleware would call it. */
const lookup = (input: { from: string }): Promise<RedirectMatch | null> => {
    const fn = redirectsSdk()['lookup'];
    if (!fn) throw new Error('redirects.lookup not registered');
    return fn(input) as Promise<RedirectMatch | null>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: LibSQLDatabase<any>;

function configWithRedirects(): AstromechConfig {
    return { ...makeTestConfig(), plugins: [redirects()] };
}

/** Raw row count in the plugin's own table. */
async function redirectRows(): Promise<Record<string, unknown>[]> {
    const rows = await db.all(sql`SELECT * FROM plugin_redirects_redirects`);
    return rows as Record<string, unknown>[];
}

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig(configWithRedirects());
});

describe('redirects — own-table storage', () => {
    it('ctx-scoped create lands in plugin_redirects_redirects, not entries', async () => {
        await redirectEntriesApi().create({
            type: 'redirect',
            fields: { from: '/old', to: '/new', status: '301', enabled: true },
        });

        const rows = await redirectRows();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.['from']).toBe('/old');
        expect(rows[0]?.['to']).toBe('/new');

        const entryRows = await db.all(
            sql`SELECT * FROM entries WHERE type = 'redirects/redirect'`
        );
        expect(entryRows).toHaveLength(0);
    });
});

describe('redirects — lookup', () => {
    beforeEach(async () => {
        await redirectEntriesApi().create({
            type: 'redirect',
            fields: { from: '/match', to: '/dest', status: '302', enabled: true },
        });
        await redirectEntriesApi().create({
            type: 'redirect',
            fields: { from: '/off', to: '/nope', status: '301', enabled: false },
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
            hooks: {
                'entry:afterCreate': (event) => {
                    observed.push(event.type);
                },
            },
        };

        // Re-register both plugins so the probe and redirects coexist.
        const resolved: ResolvedConfig = setupTestConfig(configWithRedirects());
        registerTestPlugins([redirects(), probe], resolved);

        await redirectEntriesApi().create({
            type: 'redirect',
            fields: { from: '/a', to: '/b', status: '301', enabled: true },
        });

        expect(observed).toContain('redirects/redirect');
    });
});
