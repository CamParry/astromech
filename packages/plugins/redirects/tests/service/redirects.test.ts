/**
 * The public `lookup` method: which stored rule, if any, answers a request
 * path, and with what status. The basic match, miss and disabled cases sit in
 * the end-to-end suite beside this folder; these are the rest.
 */

import type { RedirectMatch } from '../../src/index';
import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { redirects } from '../../src/index';

const service = () => currentServices.plugins.redirects;

/** Public `lookup`, called the way a frontend middleware calls it. */
function lookup(input: unknown): Promise<RedirectMatch | null> {
    return service().lookup(input as { from: string });
}

async function addRule(data: Record<string, unknown>): Promise<void> {
    await service().create({ data });
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

    it('answers null for a disabled rule, and the rule once it is enabled again', async () => {
        await addRule({ from: '/a', to: '/b', enabled: false });

        expect(await lookup({ from: '/a' })).toBeNull();

        const [rule] = (await service().list({ page: 1, limit: 20 })).data;
        if (!rule) throw new Error('the rule was not stored');
        await service().update({ id: rule.id, data: { enabled: true } });

        expect(await lookup({ from: '/a' })).toEqual({ to: '/b', status: '301' });
    });

    it('answers null for an empty path', async () => {
        expect(await lookup({ from: '' })).toBeNull();
    });

    it('rejects input with no path', async () => {
        await expect(lookup({})).rejects.toThrow();
    });
});
