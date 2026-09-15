/**
 * The public `lookup` method: which stored rule, if any, answers a request
 * path, and with what status. The basic match, miss and disabled cases sit in
 * the end-to-end suite beside this folder; these are the rest.
 */

import type { RedirectMatch } from '../../src/index';
import type { DB } from '@/database/types';
import type { JsonValue } from '@/types/domain';
import type { EntriesService } from '@/types/index';
import type { Kysely } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService as localEntries } from '@/app-context/services';
import { pluginServices } from '@/plugins/runtime/plugin-services';
import { redirects } from '../../src/index';

type RedirectsService = Record<string, (input?: unknown) => Promise<unknown>>;

/** Public `lookup`, called the way a frontend middleware calls it. */
function lookup(input: unknown): Promise<RedirectMatch | null> {
    const service = pluginServices['redirects'] as unknown as
        | RedirectsService
        | undefined;
    const fn = service?.['lookup'];
    if (!fn) throw new Error('redirects.lookup not registered');
    return fn(input) as Promise<RedirectMatch | null>;
}

/** The one entries service, typed to the wide API for these round-trips. */
const entries = (): EntriesService => localEntries as unknown as EntriesService;

async function addRule(fields: Record<string, JsonValue>): Promise<void> {
    await entries().create({ type: 'redirects/redirect', data: { fields } });
}

let db: Kysely<DB>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig({ ...makeTestConfig(), plugins: [redirects()] });
});

describe('redirects lookup', () => {
    it('answers a 301 rule with a 301', async () => {
        await addRule({ from: '/old', to: '/new', status: '301', enabled: true });

        expect(await lookup({ from: '/old' })).toEqual({ to: '/new', status: '301' });
    });

    it('answers a rule saved without a status or enabled flag as an enabled 301', async () => {
        await addRule({ from: '/old', to: '/new' });

        expect(await lookup({ from: '/old' })).toEqual({ to: '/new', status: '301' });
    });

    it('answers any stored status other than 302 as a 301', async () => {
        await addRule({ from: '/old', to: '/new', status: '302', enabled: true });
        await sql`UPDATE plugin_redirects_redirects SET status = '307'`.execute(db);

        expect(await lookup({ from: '/old' })).toEqual({ to: '/new', status: '301' });
    });

    it('matches the stored path exactly, with no trailing-slash, query or case folding', async () => {
        await addRule({ from: '/old', to: '/new' });
        await addRule({ from: '/folder/', to: '/elsewhere' });

        expect(await lookup({ from: '/old/' })).toBeNull();
        expect(await lookup({ from: '/old?ref=mail' })).toBeNull();
        expect(await lookup({ from: '/OLD' })).toBeNull();
        expect(await lookup({ from: '/folder' })).toBeNull();
        expect(await lookup({ from: '/folder/' })).toEqual({
            to: '/elsewhere',
            status: '301',
        });
    });

    it('answers with the enabled rule when a disabled rule names the same path', async () => {
        await addRule({ from: '/a', to: '/stale', enabled: false });
        await addRule({ from: '/a', to: '/live', enabled: true });
        await addRule({ from: '/b', to: '/live', enabled: true });
        await addRule({ from: '/b', to: '/stale', enabled: false });

        expect(await lookup({ from: '/a' })).toEqual({ to: '/live', status: '301' });
        expect(await lookup({ from: '/b' })).toEqual({ to: '/live', status: '301' });
    });

    it('answers null for an empty path', async () => {
        expect(await lookup({ from: '' })).toBeNull();
    });

    it('rejects input with no path', async () => {
        await expect(lookup({})).rejects.toThrow();
    });
});
