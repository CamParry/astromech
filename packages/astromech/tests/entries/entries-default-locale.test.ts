/**
 * Reads that name no locale take the configured default content locale. It may
 * be a display tag (`en-GB`) the service bridges to a content locale, and it
 * need not be `en`: the entries repository reads it from the config too.
 */

import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService } from '@/app-context/services';

const api = entriesService;

beforeEach(async () => {
    await createTestDb();
});

describe('default locale resolution for locale-less reads', () => {
    it('resolves a display defaultLocale (en-GB) to a content locale (en)', async () => {
        const cfg = makeTestConfig();
        cfg.defaultLocale = 'en-GB'; // display tag, NOT in locales
        cfg.locales = ['en', 'de']; // content locales
        setupTestConfig(cfg);

        await api.create({ type: 'post', data: { title: 'Home', locale: 'en' } });

        // No locale passed → entries service default must resolve en-GB → en.
        const res = await api.query({ type: ['post'], full: true, limit: 10 });
        expect(res.data.map((e) => e.title)).toContain('Home');

        // And the search path (what the command palette uses) works too.
        const search = await api.query({
            type: ['post'],
            search: 'home',
            full: true,
            limit: 10,
        });
        expect(search.data.map((e) => e.title)).toContain('Home');
    });
});

describe('a default content locale other than en', () => {
    it('answers a resource-level read with the default locale’s row', async () => {
        const cfg = makeTestConfig();
        cfg.defaultLocale = 'de';
        cfg.locales = ['de', 'en'];
        setupTestConfig(cfg);

        const entry = await api.create({ type: 'post', data: { title: 'Hallo' } });
        await api.update({
            type: 'post',
            id: entry.id,
            locale: 'en',
            data: { title: 'Hello' },
        });
        await api.trash({ type: 'post', id: entry.id });

        const restored = await api.restore({ type: 'post', id: entry.id });
        expect(restored.locale).toBe('de');
        expect(restored.title).toBe('Hallo');
    });
});
