/**
 * Better Auth's secret: read through `src/env.ts`, and required before a
 * request is served in production. The middleware's use of the check is
 * covered in `tests/integrations/astro/middleware.test.ts`.
 */

import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearEnvSource, setEnvSource } from '@/env';
import { assertAuthSecret, getAuth } from '@/users/auth';

const SECRET = 'auth-secret-test-0123456789abcdef0123';

beforeEach(() => {
    clearEnvSource();
    // A secret in the shell running the suite would otherwise satisfy the check.
    vi.stubEnv('BETTER_AUTH_SECRET', undefined);
});

afterEach(() => {
    delete globalThis.__astromech?.auth;
    clearEnvSource();
    vi.unstubAllEnvs();
});

describe('assertAuthSecret', () => {
    it('treats an unset NODE_ENV as production, as on a Worker', () => {
        vi.stubEnv('NODE_ENV', undefined);

        expect(() => assertAuthSecret()).toThrow(/missing env var: BETTER_AUTH_SECRET/);
    });

    it('lets the test suite run without the secret', () => {
        setEnvSource({ NODE_ENV: 'test' });

        expect(() => assertAuthSecret()).not.toThrow();
    });
});

describe('the secret Better Auth signs with', () => {
    it('comes from the registered env source', async () => {
        // `getAuth()` builds once into the registry slot, so the slot is
        // cleared before the source is set.
        delete globalThis.__astromech?.auth;
        await createTestDb();
        setupTestConfig(makeTestConfig());
        setEnvSource({ BETTER_AUTH_SECRET: SECRET });

        expect((await getAuth().$context).secret).toBe(SECRET);
    });
});
