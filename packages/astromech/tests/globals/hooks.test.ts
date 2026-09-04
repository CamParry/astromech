/**
 * The global write hooks, fired through the real plugin runtime rather than a
 * stub, so the seam under test is the one production uses.
 */

import type { PluginHooks } from '@/types/index';
import { createTestDb, registerTestPlugins, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { globalsService as api } from '@/globals/service';
import { defineHook } from '@/plugins/define-hook';
import { makeGlobalsConfig } from './globals-config';

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
