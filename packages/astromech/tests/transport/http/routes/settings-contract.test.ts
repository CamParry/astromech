/**
 * Every handler in `routes/settings.ts` over the real router: status, envelope
 * and the exact keys each one returns.
 *
 * `settings-mounted.test.ts` owns the slashed-key routing bug; this owns the
 * three handlers' contracts, so a conversion that drops `key` from the `GET
 * /:key` body or stops pinning `full: true` fails here.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { adminRole, mountRouter, roleWith } from '@tests/mount-router';
import { Astromech } from '@/transport/local/index';
import { settingsRouter } from '@/transport/http/routes/settings';
import type { Role } from '@/types/index';

function app(role: Role = adminRole) {
    return mountRouter('/settings', settingsRouter, role);
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
});

describe('GET /settings', () => {
    it('returns every setting in a { data } envelope', async () => {
        await Astromech.settings.set({ key: 'site.title', value: 'Astromech' });
        await Astromech.settings.set({ key: 'site.tagline', value: 'Small CMS' });

        const res = await app().request('/settings');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { key: string; value: unknown }[] };
        expect(Object.keys(body)).toEqual(['data']);
        const byKey = new Map(body.data.map((s) => [s.key, s.value]));
        expect(byKey.get('site.title')).toBe('Astromech');
        expect(byKey.get('site.tagline')).toBe('Small CMS');
        expect(Object.keys(body.data[0] ?? {})).toContain('value');
    });

    it('403s without settings:read', async () => {
        const res = await app(roleWith([])).request('/settings');
        expect(res.status).toBe(403);
        const body = (await res.json()) as { error: { code: string; status: number } };
        expect(body.error.code).toBe('FORBIDDEN');
        expect(body.error.status).toBe(403);
    });

    it('settings:read alone is enough', async () => {
        const res = await app(roleWith(['settings:read'])).request('/settings');
        expect(res.status).toBe(200);
    });
});

describe('GET /settings/:key', () => {
    it('returns { data: { key, value } } — the key comes from the path', async () => {
        await Astromech.settings.set({ key: 'site.title', value: 'Astromech' });

        const res = await app().request('/settings/site.title');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { key: string; value: unknown } };
        expect(Object.keys(body.data).sort()).toEqual(['key', 'value']);
        expect(body.data.key).toBe('site.title');
        expect(body.data.value).toBe('Astromech');
    });

    it('404s an unset key', async () => {
        const res = await app().request('/settings/never.set');
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toBe("Setting 'never.set' not found");
    });

    it('403s without settings:read, before the key is looked up', async () => {
        const res = await app(roleWith([])).request('/settings/never.set');
        expect(res.status).toBe(403);
    });
});

describe('PUT /settings/:key', () => {
    it('persists the value and returns the stored setting', async () => {
        const res = await app().request('/settings/site.title', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: 'New Title' }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { key: string; value: unknown } };
        expect(body.data.key).toBe('site.title');
        expect(body.data.value).toBe('New Title');
        expect(await Astromech.settings.get({ key: 'site.title', full: true })).toBe(
            'New Title'
        );
    });

    it('accepts a structured value verbatim', async () => {
        const value = { items: [{ label: 'Home', url: '/' }] };
        const res = await app().request('/settings/menus.main', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value }),
        });
        expect(res.status).toBe(200);
        expect(((await res.json()) as { data: { value: unknown } }).data.value).toEqual(
            value
        );
    });

    it('403s with settings:read but not settings:update', async () => {
        const res = await app(roleWith(['settings:read'])).request(
            '/settings/site.title',
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: 'nope' }),
            }
        );
        expect(res.status).toBe(403);
    });

    it('422s a body with no value key', async () => {
        const res = await app().request('/settings/site.title', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(422);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe('VALIDATION_FAILED');
    });
});
