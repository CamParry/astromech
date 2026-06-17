/**
 * Regression: `defaultLocale` may be a DISPLAY tag (e.g. `en-GB`) that is not a
 * content locale entries are tagged with. Queries that omit an explicit locale
 * rely on the entries service's default; it must bridge the display tag to an
 * available content locale (RFC 4647 lookup), otherwise the locale filter
 * matches nothing and reads come back empty (broke the admin command-palette
 * search, which never passes a locale).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@/test/harness.js';
import { Astromech } from '@/transport/local/index.js';

const api = Astromech.entries;

beforeEach(async () => {
    await createTestDb();
});

describe('default locale resolution for locale-less reads', () => {
    it('resolves a display defaultLocale (en-GB) to a content locale (en)', async () => {
        const cfg = makeTestConfig();
        cfg.defaultLocale = 'en-GB'; // display tag, NOT in locales
        cfg.locales = ['en', 'de']; // content locales
        setupTestConfig(cfg);

        await api.create({ type: 'post', title: 'Home', locale: 'en' });

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
