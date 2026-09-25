/**
 * The redirects plugin end to end over a migrated database: the admin
 * resource's service methods (CRUD, permissions, validation, list search and
 * paging), the public `lookup`, and the basic slug-change case.
 */

import type { RedirectMatch, RedirectRow } from '../src/index';
import type { Role } from '@/types/index';
import type { QueryResult } from 'astromech';
import { roleWith } from '@tests/fixtures';
import { contextAs, createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { createServices, currentServices } from '@/app-context/services';
import { redirects } from '../src/index';

/** The plugin's service on the trusted handle, the way site code calls it. */
const service = () => currentServices.plugins.redirects;

/** The plugin's service on a handle scoped to `role`, the way the admin calls it. */
const serviceAs = (role: Role | null) =>
    createServices(contextAs(role), { overrideAccess: false }).plugins.redirects;

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
    db = await createTestDb();
    const base = makeTestConfig();
    const post = base.entries['post'];
    if (!post) throw new Error('test harness missing `post` entry type');
    setupTestConfig({
        ...base,
        entries: { ...base.entries, post: { ...post, url: '/{slug}' } },
        plugins: [redirects()],
    });
});

/** Every stored rule, straight from the plugin's table. */
async function storedRules(): Promise<Record<string, unknown>[]> {
    const { rows } = await sql<
        Record<string, unknown>
    >`SELECT * FROM plugin_redirects_redirects ORDER BY rowid`.execute(db);
    return rows;
}

describe('redirects service — create, get, update, delete', () => {
    it('creates a rule in the plugin table with the field defaults', async () => {
        const created = await service().create({ data: { from: '/old', to: '/new' } });

        expect(created).toMatchObject({
            from: '/old',
            to: '/new',
            status: '301',
            enabled: true,
        });
        expect(created.id).toEqual(expect.any(String));
        const rows = await storedRules();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: created.id, from: '/old', to: '/new' });
    });

    it('gets a rule by id, and null for an unknown id', async () => {
        const created = await service().create({ data: { from: '/a', to: '/b' } });

        expect(await service().get({ id: created.id })).toMatchObject({
            from: '/a',
            to: '/b',
        });
        expect(await service().get({ id: 'missing' })).toBeNull();
    });

    it('updates the fields it is given and keeps the rest', async () => {
        const created = await service().create({
            data: { from: '/a', to: '/b', status: '302' },
        });

        const updated = await service().update({
            id: created.id,
            data: { to: '/c', enabled: false },
        });

        expect(updated).toMatchObject({
            id: created.id,
            from: '/a',
            to: '/c',
            status: '302',
            enabled: false,
        });
        expect(await storedRules()).toEqual([
            expect.objectContaining({ from: '/a', to: '/c', status: '302', enabled: 0 }),
        ]);
    });

    it('answers null when updating an unknown id', async () => {
        expect(await service().update({ id: 'missing', data: { to: '/x' } })).toBeNull();
    });

    it('deletes a rule, and reports nothing deleted for an unknown id', async () => {
        const created = await service().create({ data: { from: '/a', to: '/b' } });

        expect(await service().delete({ id: created.id })).toEqual({ deleted: true });
        expect(await service().delete({ id: created.id })).toEqual({ deleted: false });
        expect(await storedRules()).toEqual([]);
    });
});

describe('redirects service — validation', () => {
    it('answers a 422 naming each missing required field', async () => {
        await expect(service().create({ data: { status: '301' } })).rejects.toMatchObject(
            {
                name: 'ValidationError',
                fields: {
                    from: ['This field is required'],
                    to: ['This field is required'],
                },
            }
        );
        expect(await storedRules()).toEqual([]);
    });

    it('answers a 422 on a status outside the options', async () => {
        await expect(
            service().create({ data: { from: '/a', to: '/b', status: '307' } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { status: [expect.any(String)] },
        });
    });

    it('answers a 422 on `from` when another rule holds the path', async () => {
        await service().create({ data: { from: '/taken', to: '/one' } });

        await expect(
            service().create({ data: { from: '/taken', to: '/two' } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { from: ['Already in use'] },
        });
        expect(await storedRules()).toHaveLength(1);
    });

    it('answers a 422 when an update moves `from` onto another rule, and lets a rule keep its own', async () => {
        await service().create({ data: { from: '/taken', to: '/one' } });
        const other = await service().create({ data: { from: '/free', to: '/two' } });

        await expect(
            service().update({ id: other.id, data: { from: '/taken' } })
        ).rejects.toMatchObject({
            name: 'ValidationError',
            fields: { from: ['Already in use'] },
        });
        await expect(
            service().update({ id: other.id, data: { from: '/free', to: '/three' } })
        ).resolves.toMatchObject({ from: '/free', to: '/three' });
    });
});

describe('redirects service — list', () => {
    beforeEach(async () => {
        for (const [from, to] of [
            ['/c-old', '/c-new'],
            ['/a-old', '/a-new'],
            ['/b-old', '/shop'],
            ['/d-old', '/d-new'],
            ['/e-old', '/e-new'],
        ]) {
            await service().create({ data: { from, to } });
        }
    });

    const froms = (result: QueryResult<RedirectRow>) =>
        result.data.map((rule) => rule.from);

    it('orders by `from` by default and pages with a total', async () => {
        const first = await service().list({ page: 1, limit: 2 });
        const last = await service().list({ page: 3, limit: 2 });

        expect(froms(first)).toEqual(['/a-old', '/b-old']);
        expect(first.pagination).toEqual({ page: 1, limit: 2, total: 5, pages: 3 });
        expect(froms(last)).toEqual(['/e-old']);
    });

    it('sorts by a sortable column in either direction', async () => {
        const result = await service().list({
            sort: { from: 'desc' },
            page: 1,
            limit: 2,
        });

        expect(froms(result)).toEqual(['/e-old', '/d-old']);
    });

    it('rejects a sort on a column it cannot sort by', async () => {
        await expect(
            service().list({ sort: { secret: 'asc' }, page: 1, limit: 20 })
        ).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('searches `from` and `to`, and counts only the matches', async () => {
        const byFrom = await service().list({ search: 'a-o', page: 1, limit: 20 });
        const byTo = await service().list({ search: 'shop', page: 1, limit: 20 });

        expect(froms(byFrom)).toEqual(['/a-old']);
        expect(byFrom.pagination?.total).toBe(1);
        expect(froms(byTo)).toEqual(['/b-old']);
    });
});

describe('redirects service — permissions', () => {
    it('refuses every admin method to a role without the plugin permissions', async () => {
        const created = await service().create({ data: { from: '/a', to: '/b' } });
        const denied = serviceAs(roleWith([]));

        await expect(denied.list({ page: 1, limit: 20 })).rejects.toMatchObject({
            name: 'PermissionDeniedError',
            permission: 'plugin:redirects:read',
        });
        await expect(denied.get({ id: created.id })).rejects.toMatchObject({
            permission: 'plugin:redirects:read',
        });
        await expect(
            denied.create({ data: { from: '/x', to: '/y' } })
        ).rejects.toMatchObject({ permission: 'plugin:redirects:create' });
        await expect(
            denied.update({ id: created.id, data: { to: '/z' } })
        ).rejects.toMatchObject({ permission: 'plugin:redirects:update' });
        await expect(denied.delete({ id: created.id })).rejects.toMatchObject({
            permission: 'plugin:redirects:delete',
        });
        expect(await storedRules()).toHaveLength(1);
    });

    it('lets a role read without writing when it holds only `read`', async () => {
        await service().create({ data: { from: '/a', to: '/b' } });
        const reader = serviceAs(roleWith(redirects.permissions('read')));

        expect((await reader.list({ page: 1, limit: 20 })).data).toHaveLength(1);
        await expect(
            reader.create({ data: { from: '/x', to: '/y' } })
        ).rejects.toMatchObject({ name: 'PermissionDeniedError' });
    });

    it('answers lookup with no role at all', async () => {
        await service().create({ data: { from: '/a', to: '/b' } });

        expect(await serviceAs(null).lookup({ from: '/a' })).toEqual({
            to: '/b',
            status: '301',
        });
    });
});

describe('redirects — lookup', () => {
    beforeEach(async () => {
        await service().create({
            data: { from: '/match', to: '/dest', status: '302', enabled: true },
        });
        await service().create({
            data: { from: '/off', to: '/nope', status: '301', enabled: false },
        });
    });

    it('resolves an enabled match', async () => {
        const result: RedirectMatch | null = await service().lookup({ from: '/match' });
        expect(result).toEqual({ to: '/dest', status: '302' });
    });

    it('returns null for a non-matching path', async () => {
        expect(await service().lookup({ from: '/missing' })).toBeNull();
    });

    it('skips a disabled redirect', async () => {
        expect(await service().lookup({ from: '/off' })).toBeNull();
    });
});

describe('redirects — slug-change hook', () => {
    it('records a redirect when a root entry slug changes', async () => {
        const post = await currentServices.entries.create({
            type: 'post',
            data: { title: 'Hello' },
        });
        expect(post.slug).toBe('hello');

        await currentServices.entries.update({
            type: 'post',
            id: post.id,
            data: { slug: 'goodbye' },
        });

        expect(await storedRules()).toEqual([
            expect.objectContaining({ from: '/hello', to: '/goodbye' }),
        ]);
    });

    it('creates nothing when the slug is unchanged', async () => {
        const post = await currentServices.entries.create({
            type: 'post',
            data: { title: 'Stable' },
        });
        await currentServices.entries.update({
            type: 'post',
            id: post.id,
            data: { title: 'Stable Renamed' },
        });
        expect(await storedRules()).toEqual([]);
    });
});
