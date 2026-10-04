/**
 * The Astro middleware refuses a request in production while Better Auth's
 * secret is unset, before it creates the application.
 */

import type { AstromechConfig, SchedulerDriver } from '@/types/index';
import type { APIContext } from 'astro';
import { expectConsole } from '@tests/console';
import { createTestDb, makeBootConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAstromech } from '@/astromech';
import { getMigrationProvider } from '@/database/migration-registry';
import { clearEnvSource, setEnvSource } from '@/env';
import { onRequest } from '@/integrations/astro/middleware';

// The site config the middleware boots, set per test. Read through a getter
// because the mock is built before any test runs.
const site = vi.hoisted(() => ({
    config: undefined as AstromechConfig | undefined,
    migrationNames: null as readonly string[] | null,
}));

vi.mock('virtual:astromech/config', () => ({
    get rawConfig() {
        return site.config;
    },
    get migrationNames() {
        return site.migrationNames;
    },
}));

const SECRET = 'middleware-test-0123456789abcdef0123';

/** Starts nothing, so a boot here leaves no ticker running. */
const noScheduler: SchedulerDriver = { name: 'none', start: () => undefined };

beforeEach(async () => {
    await createTestDb();
    site.config = { ...makeBootConfig(), scheduler: noScheduler };
    site.migrationNames = null;
    clearEnvSource();
    // A secret in the shell running the suite would otherwise satisfy the check.
    vi.stubEnv('BETTER_AUTH_SECRET', undefined);
});

afterEach(() => {
    clearEnvSource();
    vi.unstubAllEnvs();
});

/** The slice of Astro's context the middleware reads. */
function context(isPrerendered = false): APIContext {
    return {
        request: new Request('http://localhost/'),
        isPrerendered,
    } as unknown as APIContext;
}

function page(): Promise<Response> {
    return Promise.resolve(new Response('page'));
}

/** The body of the response the middleware resolves to. */
async function bodyOf(pending: ReturnType<typeof onRequest>): Promise<string> {
    const response = await pending;
    if (!(response instanceof Response)) {
        throw new Error('the middleware resolved to no response');
    }
    return response.text();
}

describe('the Astro middleware', () => {
    it('refuses a request in production without the secret, before creating the application', async () => {
        setEnvSource({ NODE_ENV: 'production' });
        const next = vi.fn(page);

        await expect(onRequest(context(), next)).rejects.toThrow(
            /missing env var: BETTER_AUTH_SECRET.*openssl rand -base64 32/
        );
        expect(next).not.toHaveBeenCalled();
        expect(() => getAstromech()).toThrow(/no instance of Astromech exists/);
    });

    it('serves a request in production with the secret from the env source', async () => {
        setEnvSource({ NODE_ENV: 'production', BETTER_AUTH_SECRET: SECRET });

        expect(await bodyOf(onRequest(context(), page))).toBe('page');
    });

    it('serves a request in development without the secret', async () => {
        setEnvSource({ NODE_ENV: 'development' });

        expect(await bodyOf(onRequest(context(), page))).toBe('page');
    });

    // A Worker has no file system to read the migrations folder from.
    it('checks the database against the migration names bundled at build time', async () => {
        setEnvSource({ NODE_ENV: 'development' });
        const applied = Object.keys(await getMigrationProvider().getMigrations());
        site.migrationNames = [...applied, '9999_not-applied'];
        expectConsole(
            'error',
            '1 migration has not been applied to this database: 9999_not-applied'
        );

        expect(await bodyOf(onRequest(context(), page))).toBe('page');
    });

    it('prerenders a page at build time without the secret', async () => {
        setEnvSource({ NODE_ENV: 'production' });

        expect(await bodyOf(onRequest(context(true), page))).toBe('page');
    });
});
