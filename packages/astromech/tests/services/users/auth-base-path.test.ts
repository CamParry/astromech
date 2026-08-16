/**
 * better-auth's `basePath` follows the site's configured `basePath`.
 *
 * `getAuth()` reads it from the config registry slot at first access, so a host
 * mounting Astromech somewhere other than `/cms` gets auth endpoints under the
 * same prefix.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { getAuth } from '@/users/auth';

// `getAuth()` builds once and memoises into the registry slot, so the slot is
// cleared and the config put in place before any test in this file asks for it.
beforeAll(async () => {
    delete globalThis.__astromech?.auth;
    await createTestDb();
    setupTestConfig({ ...makeTestConfig(), basePath: '/cms' });
});

describe('the auth base path', () => {
    it('sits under the configured basePath', () => {
        expect(getAuth().options.basePath).toBe('/cms/api/auth');
    });
});
