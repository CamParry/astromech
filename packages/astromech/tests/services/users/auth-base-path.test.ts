/**
 * better-auth's `basePath` follows the site's configured `basePath`.
 *
 * `getAuth()` reads it from the config registry slot at first access, so a host
 * mounting Astromech somewhere other than `/cms` gets auth endpoints under the
 * same prefix.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { auth } from '@/users/auth';

// `auth` builds itself once, on first access, so the config has to be in place
// before any test in this file touches it.
beforeAll(async () => {
    await createTestDb();
    setupTestConfig({ ...makeTestConfig(), basePath: '/cms' });
});

describe('the auth base path', () => {
    it('sits under the configured basePath', () => {
        expect(auth.options.basePath).toBe('/cms/api/auth');
    });
});
