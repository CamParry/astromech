/**
 * The grant each globals route demands, derived from the key it addresses.
 *
 * Two properties: a `global:<key>:<action>` grant reaches exactly its own
 * global and no plugin's, and the ONE unauthenticated shape — a `public`
 * global's plain read — needs no grant at all while `full` and `staged` always
 * do.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { adminRole, roleWith, seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, configWithGlobals, json, put, SEO } from './globals-app';

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig(configWithGlobals());
    await seedTestUser(db);
});

/** Save `key` as an administrator, so a permission case has a row to read. */
async function save(key: string, fields: Record<string, unknown>): Promise<void> {
    const res = await app(adminRole).request(`/globals/${key}`, put({ fields }));
    expect(res.status).toBe(200);
}

describe('reading', () => {
    it('gates ?full=true on global:<key>:read', async () => {
        await save('site', { title: 'A' });

        expect(
            (await app(roleWith(['global:site:read'])).request('/globals/site?full=true'))
                .status
        ).toBe(200);
        expect((await app(roleWith([])).request('/globals/site?full=true')).status).toBe(
            403
        );
    });

    it('needs no grant for a public global’s plain read', async () => {
        await save('legal', { terms: 'Be nice' });
        await app(adminRole).request('/globals/legal/publish', json({}));

        const res = await app(roleWith([])).request('/globals/legal');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { fields: unknown } };
        expect(body.data.fields).toEqual({ terms: 'Be nice' });
    });

    it('404s a public global that is not published — the read is the public one', async () => {
        await save('legal', { terms: 'Draft' });

        const res = await app(roleWith([])).request('/globals/legal');
        expect(res.status).toBe(404);
    });

    it('403s a public global asked for in the full shape', async () => {
        await save('legal', { terms: 'Be nice' });

        expect((await app(roleWith([])).request('/globals/legal?full=true')).status).toBe(
            403
        );
    });

    it('403s a private global’s plain read', async () => {
        await save('contact', { email: 'a@b.dev' });

        expect((await app(roleWith([])).request('/globals/contact')).status).toBe(403);
    });
});

describe('writing', () => {
    it('gates PUT on global:<key>:update', async () => {
        expect(
            (
                await app(roleWith(['global:site:update'])).request(
                    '/globals/site',
                    put({ fields: { title: 'A' } })
                )
            ).status
        ).toBe(200);
        expect(
            (
                await app(roleWith(['global:site:read'])).request(
                    '/globals/site',
                    put({ fields: { title: 'A' } })
                )
            ).status
        ).toBe(403);
    });

    it('does not let one global’s grant reach another', async () => {
        const res = await app(roleWith(['global:site:update'])).request(
            '/globals/contact',
            put({ fields: { email: 'a@b.dev' } })
        );
        expect(res.status).toBe(403);
    });

    it('gates a plugin global on plugin:<ns>:global:<key>:update', async () => {
        expect(
            (
                await app(roleWith(['plugin:seo:global:settings:update'])).request(
                    `/globals/${SEO}`,
                    put({ fields: { titleTemplate: 'x' } })
                )
            ).status
        ).toBe(200);
        // The host form must not reach a plugin's global — that is the
        // escalation the qualified derivation exists to prevent.
        expect(
            (
                await app(roleWith(['global:settings:update'])).request(
                    `/globals/${SEO}`,
                    put({ fields: { titleTemplate: 'x' } })
                )
            ).status
        ).toBe(403);
    });
});

describe('publishing', () => {
    const publisher = ['global:site:read', 'global:site:update', 'global:site:publish'];

    beforeEach(async () => {
        await save('site', { title: 'A' });
    });

    it.each(['publish', 'unpublish', 'schedule'])(
        'gates %s on global:<key>:publish',
        async (action) => {
            const body =
                action === 'schedule' ? { publishedAt: '2099-01-01T00:00:00.000Z' } : {};
            expect(
                (
                    await app(roleWith(publisher)).request(
                        `/globals/site/${action}`,
                        json(body)
                    )
                ).status
            ).toBe(200);
            expect(
                (
                    await app(roleWith(['global:site:update'])).request(
                        `/globals/site/${action}`,
                        json(body)
                    )
                ).status
            ).toBe(403);
        }
    );

    it('gates merging a staged change on global:<key>:publish', async () => {
        await app(adminRole).request('/globals/site/staged', json({}));

        expect(
            (
                await app(roleWith(['global:site:update'])).request(
                    '/globals/site/staged/merge',
                    json({})
                )
            ).status
        ).toBe(403);
        expect(
            (
                await app(roleWith(publisher)).request(
                    '/globals/site/staged/merge',
                    json({})
                )
            ).status
        ).toBe(200);
    });
});
