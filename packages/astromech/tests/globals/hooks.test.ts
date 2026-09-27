/**
 * The global write hooks, fired through the real plugin runtime rather than a
 * stub, so the seam under test is the one production uses.
 */

import type { PluginHooks } from '@/types/index';
import { createTestDb, registerTestPlugins, setupTestConfig } from '@tests/harness';
import { seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { HookOutputValidationError } from '@/errors/output-validation';
import { ValidationError } from '@/errors/validation';
import { defineHook } from '@/plugins/define-hook';
import { app, put } from '../transport/http/routes/globals-app';
import { makeGlobalsConfig } from './globals-config';

const api = currentServices.globals;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeGlobalsConfig());
});

/** Register a probe plugin's hooks against the live runtime. */
function probe(hooks: PluginHooks): void {
    const resolved = setupTestConfig(makeGlobalsConfig());
    registerTestPlugins([{ package: '@test/probe', hooks }], resolved);
}

describe('global:beforeUpdate', () => {
    it('sees the key, the locale and the null record of a first write', async () => {
        const seen: Record<string, unknown>[] = [];
        probe([
            defineHook('global:beforeUpdate', (ctx) => {
                seen.push({ key: ctx.key, locale: ctx.locale, global: ctx.global });
            }),
        ]);

        await api.update({ key: 'contact', data: { fields: { email: 'a@b.dev' } } });

        expect(seen).toEqual([{ key: 'contact', locale: 'en', global: null }]);
    });

    it('replaces the data that gets written', async () => {
        probe([
            defineHook('global:beforeUpdate', (ctx) => ({
                ...ctx,
                data: { fields: { ...ctx.data.fields, phone: 'from-the-hook' } },
            })),
        ]);

        const saved = await api.update({
            key: 'contact',
            data: { fields: { email: 'a@b.dev' } },
        });

        expect(saved.fields).toEqual({ email: 'a@b.dev', phone: 'from-the-hook' });
    });

    it('fails as the hook’s error, naming it, when its data has a key the schema does not declare', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        probe([
            defineHook('global:beforeUpdate', (ctx) => ({
                ...ctx,
                data: { ...ctx.data, extra: true } as typeof ctx.data,
            })),
        ]);

        const write = api.update({ key: 'contact', data: { fields: {} } });

        await expect(write).rejects.toThrow(HookOutputValidationError);
        await expect(write).rejects.toThrow(
            'global:beforeUpdate returned data that fails its schema'
        );
        expect(String(logged.mock.calls[0]?.[0])).toContain('extra');
        expect(await api.get({ key: 'contact', full: true })).toBeNull();
    });

    it('answers the caller’s own undeclared key with a 422 before the hook runs', async () => {
        const seen: unknown[] = [];
        probe([defineHook('global:beforeUpdate', (ctx) => void seen.push(ctx))]);

        await expect(
            api.update({ key: 'contact', data: { fields: {}, extra: true } as never })
        ).rejects.toThrow(ValidationError);
        expect(seen).toEqual([]);
    });

    it('a throw aborts the write', async () => {
        probe([
            defineHook('global:beforeUpdate', () => {
                throw new Error('blocked');
            }),
        ]);

        await expect(
            api.update({ key: 'contact', data: { fields: {} } })
        ).rejects.toThrow('blocked');
        expect(await api.get({ key: 'contact', full: true })).toBeNull();
    });
});

describe('global:afterUpdate', () => {
    it('receives the saved global, without the content row id', async () => {
        const seen: Record<string, unknown>[] = [];
        probe([
            defineHook('global:afterUpdate', (ctx) => {
                seen.push(ctx.global as unknown as Record<string, unknown>);
            }),
        ]);

        const saved = await api.update({
            key: 'contact',
            data: { fields: { email: 'a@b.dev' } },
        });

        expect(seen).toHaveLength(1);
        expect(seen[0]?.['id']).toBe(saved.id);
        expect(seen[0]?.['fields']).toEqual({ email: 'a@b.dev' });
        expect(seen[0]).not.toHaveProperty('contentId');
    });
});

describe('a hook’s refused data over HTTP', () => {
    it('answers 500 without the issues, and the caller’s own bad key 422', async () => {
        await seedTestUser(await createTestDb());
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        probe([
            defineHook('global:beforeUpdate', (ctx) => ({
                ...ctx,
                data: { ...ctx.data, extra: true } as typeof ctx.data,
            })),
        ]);

        const hooked = await app().request('/globals/contact', put({ fields: {} }));
        expect(hooked.status).toBe(500);
        const body = (await hooked.json()) as {
            error: { code: string; message: string };
        };
        expect(body.error.code).toBe('INTERNAL_ERROR');
        expect(JSON.stringify(body)).not.toContain('extra');
        expect(logged.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
            'global:beforeUpdate returned data that fails its schema'
        );

        const own = await app().request(
            '/globals/contact',
            put({ fields: {}, bogus: 1 })
        );
        expect(own.status).toBe(422);
        const refused = (await own.json()) as {
            error: { details: { fields: Record<string, string[]> } };
        };
        expect(refused.error.details.fields).toEqual({ bogus: ['Unknown key'] });
    });
});
